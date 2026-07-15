import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { resolveCaseFileForContext } from '../../documents/resolve-case-file.util';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Persiste o resumo do caso que a IA já compôs (com base no histórico de
 * atendimento + `getCaseContext`). Puramente um "save" — a composição em
 * si é responsabilidade do agente, não desta tool.
 */
@Injectable()
export class SaveCaseSummaryTool implements AiTool {
  private readonly logger = new Logger(SaveCaseSummaryTool.name);

  readonly name = 'saveCaseSummary';
  readonly description =
    'Salva o resumo do caso na pasta do cliente. Use getCaseContext antes para basear o resumo no conteúdo real dos documentos já recebidos, além do histórico de atendimento.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['summary'],
    properties: {
      summary: {
        type: 'string',
        description: 'Resumo do caso — fatos relevantes, pedido do cliente, documentos já conferidos.',
        minLength: 20,
        maxLength: 8000,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const summary = String(input.summary ?? '').trim();
    if (summary.length < 20) {
      return { output: { ok: false, error: 'summary muito curto' } };
    }

    const caseFile = await resolveCaseFileForContext(this.prisma, ctx);
    if (!caseFile) {
      return {
        output: {
          ok: false,
          error: 'Nenhuma pasta de caso encontrada — chame createCaseFile primeiro.',
        },
      };
    }

    await this.prisma.caseFile.update({
      where: { id: caseFile.id },
      data: {
        caseSummary: summary,
        caseSummaryUpdatedAt: new Date(),
        status: caseFile.status === 'PETITION_DRAFT' || caseFile.status === 'PETITION_APPROVED'
          ? caseFile.status
          : 'SUMMARY_READY',
      },
    });

    this.logger.log(`IA salvou resumo do caso ${caseFile.id} (${summary.length} chars)`);

    return { output: { ok: true, caseFileId: caseFile.id } };
  }
}
