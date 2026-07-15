import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { PendingActionService } from '../../confirmations/pending-action.service';
import { resolveCaseFileForContext } from '../../documents/resolve-case-file.util';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Submete o rascunho da petição inicial para aprovação humana. SEMPRE passa
 * por um `AiPendingAction` — não existe modo "sem aprovação" pra esta tool,
 * ao contrário das skills HTTP customizadas (cujo gate é opcional via
 * `AiAgentSkill.requiresApproval`). Estrutura copiada de
 * `transfer-to-human.tool.ts`: cria a pendência, notifica em tempo real, e
 * devolve um `finalAction` que para o loop do agente até um advogado
 * decidir. A execução pós-aprovação de fato (gravar no CaseFile) é feita
 * por `PendingActionExecutorProcessor` (branch dedicado, ver Fase B4).
 */
@Injectable()
export class DraftInitialPetitionTool implements AiTool {
  private readonly logger = new Logger(DraftInitialPetitionTool.name);

  readonly name = 'draftInitialPetition';
  readonly description =
    'Envia o rascunho da petição inicial para revisão de um advogado humano. Use somente depois de ter um resumo do caso salvo (saveCaseSummary) e a documentação conferida. O rascunho NUNCA é enviado ao cliente ou protocolado automaticamente — sempre aguarda aprovação humana.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['draftText', 'rationale'],
    properties: {
      draftText: {
        type: 'string',
        description: 'Texto completo da minuta da petição inicial.',
        minLength: 100,
        maxLength: 20000,
      },
      rationale: {
        type: 'string',
        description: 'Nota curta para o advogado revisor: base do pedido, pontos de atenção, o que ainda falta confirmar.',
        maxLength: 1000,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly pendingActions: PendingActionService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const draftText = String(input.draftText ?? '').trim();
    const rationale = String(input.rationale ?? '').trim();

    if (draftText.length < 100) {
      return { output: { ok: false, error: 'draftText muito curto para uma petição inicial' } };
    }

    const caseFile = await resolveCaseFileForContext(this.prisma, ctx);
    if (!caseFile) {
      return {
        output: {
          ok: false,
          error: 'Nenhuma pasta de caso encontrada — chame createCaseFile e saveCaseSummary primeiro.',
        },
      };
    }

    const preview = {
      action: `Revisar minuta de petição inicial — ${rationale || 'sem observações adicionais'}`,
      impact: 'critical' as const,
      rollback: 'Rejeitar a pendência — o agente pode reelaborar o rascunho.',
      affectedEntity: {
        type: 'caseFile' as const,
        id: caseFile.id,
        label: `caseFile:${caseFile.id}`,
      },
    };

    const action = await this.pendingActions.create({
      agentRunId: ctx.runId,
      conversationId: ctx.conversationId,
      agentId: ctx.agentId,
      toolName: this.name,
      args: { draftText, rationale, caseFileId: caseFile.id },
      preview,
    });

    await this.prisma.caseFile.update({
      where: { id: caseFile.id },
      data: { status: 'PETITION_DRAFT', petitionDraftStatus: 'PENDING_APPROVAL' },
    });

    this.realtime.emitToConversation(ctx.conversationId, 'conversation:pending-action', {
      conversationId: ctx.conversationId,
      pendingActionId: action.id,
      toolName: this.name,
      impact: preview.impact,
      reason: rationale,
    });

    this.logger.log(
      `Agent ${ctx.agentId} submeteu petição inicial para aprovação (caseFile=${caseFile.id}) → pendingAction=${action.id}`,
    );

    return {
      output: {
        ok: true,
        status: 'queued_for_processing',
        pendingActionId: action.id,
        message:
          'Rascunho enviado para revisão de um advogado. Ele será analisado antes de qualquer protocolo.',
        agent_should_say:
          'Avise o cliente, com naturalidade, que a minuta da petição já está pronta e vai passar por revisão da equipe jurídica antes de seguir. NÃO mencione "aprovação", "pendência" ou detalhes internos do processo.',
      },
      finalAction: 'PETITION_DRAFT_SUBMITTED',
    };
  }
}
