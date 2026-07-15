import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { resolveCaseFileForContext } from '../../documents/resolve-case-file.util';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * Leitura agregada da pasta do caso: status de cada documento + o texto
 * REAL extraído deles (quando já processado), pra a IA usar como base pra
 * `saveCaseSummary`/`draftInitialPetition`. É a ponte entre a extração de
 * documento (DocumentExtractionService, assíncrona) e o que o agente
 * efetivamente enxerga — sem isso a IA só teria o nome do arquivo.
 */
@Injectable()
export class GetCaseContextTool implements AiTool {
  readonly name = 'getCaseContext';
  readonly description =
    'Retorna o status de cada documento da pasta do caso e o texto real já extraído deles (RG, comprovantes, contratos, etc). Use antes de escrever o resumo do caso ou a petição inicial, para basear-se no conteúdo real dos documentos, não só no nome do arquivo.';
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
    const caseFile = await resolveCaseFileForContext(this.prisma, ctx);
    if (!caseFile) {
      return {
        output: {
          ok: false,
          error: 'Nenhuma pasta de caso encontrada — chame createCaseFile primeiro.',
        },
      };
    }

    const documents = await this.prisma.caseDocument.findMany({
      where: { caseFileId: caseFile.id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      output: {
        ok: true,
        caseFileId: caseFile.id,
        status: caseFile.status,
        existingSummary: caseFile.caseSummary,
        documents: documents.map((d) => ({
          docType: d.docType,
          status: d.status,
          extractionStatus: d.extractionStatus,
          extractedText:
            d.extractionStatus === 'EXTRACTED' ? d.extractedText : null,
          note:
            d.extractionStatus === 'PENDING'
              ? 'ainda processando — tente novamente em instantes'
              : d.extractionStatus === 'UNSUPPORTED_FORMAT'
                ? 'formato não suportado para leitura automática — confira manualmente'
                : d.extractionStatus === 'FAILED'
                  ? 'falha ao ler o conteúdo — confira manualmente'
                  : undefined,
        })),
      },
    };
  }
}
