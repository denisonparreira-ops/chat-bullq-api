import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { resolveCardForContext } from '../../documents/resolve-case-file.util';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const STATUS_BY_STAGE_TYPE: Record<string, 'TRIAGE' | 'PETITION_APPROVED' | 'FILED' | 'ARCHIVED' | undefined> = {
  WON: 'FILED',
  LOST: 'ARCHIVED',
};

/**
 * Move o card do caso pro próximo estágio do pipeline Jurídico e sincroniza
 * CaseFile.status. Resolve o estágio por NOME (não por id fixo) dentro do
 * próprio pipeline do card — portável entre orgs/ambientes, ao contrário
 * de MoveRecoveryCardTool (que tem os stageKeys hardcoded porque atua
 * sempre no mesmo pipeline fixo de recuperação de vendas).
 */
@Injectable()
export class MoveLegalCaseStageTool implements AiTool {
  private readonly logger = new Logger(MoveLegalCaseStageTool.name);

  readonly name = 'moveLegalCaseStage';
  readonly description =
    'Move o card do caso jurídico desta conversa para outro estágio do pipeline (ex: "Aguardando Documentos", "Documentos Completos", "Resumo/Minuta em Elaboração", "Petição em Aprovação"). Use o nome exato do estágio como aparece no pipeline. NÃO use para marcar como protocolado — isso é feito manualmente por um advogado após o peticionamento real.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['stageName'],
    properties: {
      stageName: {
        type: 'string',
        description: 'Nome exato do estágio destino dentro do pipeline Jurídico.',
        maxLength: 60,
      },
      reason: {
        type: 'string',
        description: 'Motivo curto da mudança (opcional, fica no histórico).',
        maxLength: 280,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const stageName = String(input.stageName ?? '').trim();
    if (!stageName) {
      return { output: { ok: false, error: 'stageName é obrigatório' } };
    }

    const card = await resolveCardForContext(this.prisma, ctx);
    if (!card) {
      return { output: { ok: false, error: 'Nenhum card encontrado para este cliente.' } };
    }

    const stage = await this.prisma.pipelineStage.findFirst({
      where: {
        pipelineId: card.pipelineId,
        name: { equals: stageName, mode: 'insensitive' },
      },
    });
    if (!stage) {
      const available = await this.prisma.pipelineStage.findMany({
        where: { pipelineId: card.pipelineId },
        select: { name: true },
        orderBy: { order: 'asc' },
      });
      return {
        output: {
          ok: false,
          error: `Estágio "${stageName}" não encontrado neste pipeline.`,
          availableStages: available.map((s) => s.name),
        },
      };
    }

    await this.prisma.card.update({
      where: { id: card.id },
      data: { stageId: stage.id },
    });

    const caseFileStatus = STATUS_BY_STAGE_TYPE[stage.type];
    if (card.caseFile && caseFileStatus) {
      await this.prisma.caseFile.update({
        where: { id: card.caseFile.id },
        data: { status: caseFileStatus },
      });
    }

    this.realtime.emitToOrg(ctx.organizationId, 'card:moved', {
      cardId: card.id,
      pipelineId: card.pipelineId,
      toStageId: stage.id,
      source: 'ai_agent',
    });

    this.logger.log(
      `IA moveu card ${card.id} → estágio "${stage.name}" (conv=${ctx.conversationId})`,
    );

    return { output: { ok: true, cardId: card.id, stageId: stage.id, stageName: stage.name } };
  }
}
