import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { resolveCardForContext } from '../../documents/resolve-case-file.util';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Cria a "pasta do caso" (CaseFile) — anchor leve local, ligada ao card do
 * pipeline Jurídico deste contato. Não abre pasta em nenhuma ferramenta
 * externa de gestão processual — isso fica pra uma skill HTTP customizada
 * (Jarvis), configurada quando o escritório escolher a ferramenta.
 */
@Injectable()
export class CreateCaseFileTool implements AiTool {
  private readonly logger = new Logger(CreateCaseFileTool.name);

  readonly name = 'createCaseFile';
  readonly description =
    'Cria a pasta do caso jurídico para o cliente desta conversa, a partir do card já aberto no pipeline Jurídico. Use uma única vez, no início da triagem jurídica, antes de registrar documentos ou resumo.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    properties: {},
  };

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    _input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const card = await resolveCardForContext(this.prisma, ctx);

    if (!card) {
      return {
        output: {
          ok: false,
          error:
            'Nenhum card encontrado para este cliente. A pasta do caso só pode ser criada depois que o card existir no pipeline Jurídico (normalmente criado automaticamente quando o contrato é assinado).',
        },
      };
    }

    if (card.caseFile) {
      return {
        output: { ok: true, caseFileId: card.caseFile.id, alreadyExists: true },
      };
    }

    const caseFile = await this.prisma.caseFile.create({
      data: {
        organizationId: ctx.organizationId,
        cardId: card.id,
        contactId: ctx.contactId,
        status: 'TRIAGE',
      },
    });

    this.logger.log(
      `IA criou pasta de caso ${caseFile.id} (card=${card.id}, contact=${ctx.contactId})`,
    );

    return { output: { ok: true, caseFileId: caseFile.id, alreadyExists: false } };
  }
}
