import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../../../database/prisma.service';
import { resolveCaseFileForContext } from '../../documents/resolve-case-file.util';
import { DOCUMENT_EXTRACTION_QUEUE } from '../../documents/document-extraction.processor';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

const ALLOWED_STATUS = ['PENDING', 'RECEIVED', 'REJECTED'] as const;

/**
 * Registra um documento (tipo + status) na pasta do caso e, quando um
 * anexo real foi enviado (messageId), enfileira a extração assíncrona do
 * conteúdo (OCR/texto nativo de PDF) — ver DocumentExtractionService.
 */
@Injectable()
export class RecordCaseDocumentTool implements AiTool {
  private readonly logger = new Logger(RecordCaseDocumentTool.name);

  readonly name = 'recordCaseDocument';
  readonly description =
    'Registra ou atualiza um documento da pasta do caso (ex: "RG", "Comprovante de Residência", "Procuração"). Se o cliente já enviou o anexo nesta conversa, passe o messageId da mensagem com o anexo para que o conteúdo seja lido automaticamente em background.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['docType', 'status'],
    properties: {
      docType: {
        type: 'string',
        description: 'Tipo do documento, em texto livre (ex: "RG", "Comprovante de Residência").',
        maxLength: 80,
      },
      status: {
        type: 'string',
        enum: [...ALLOWED_STATUS],
        description: 'PENDING = ainda aguardando, RECEIVED = cliente enviou, REJECTED = enviado mas inválido/ilegível.',
      },
      messageId: {
        type: 'string',
        description: 'ID da mensagem que contém o anexo real, quando status=RECEIVED.',
      },
      notes: {
        type: 'string',
        description: 'Observação curta opcional (ex: motivo da rejeição).',
        maxLength: 280,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DOCUMENT_EXTRACTION_QUEUE)
    private readonly extractionQueue: Queue,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const docType = String(input.docType ?? '').trim();
    const status = String(input.status ?? '') as (typeof ALLOWED_STATUS)[number];
    const messageId = input.messageId ? String(input.messageId) : null;
    const notes = input.notes ? String(input.notes).slice(0, 280) : null;

    if (!docType) {
      return { output: { ok: false, error: 'docType é obrigatório' } };
    }
    if (!ALLOWED_STATUS.includes(status)) {
      return { output: { ok: false, error: 'status inválido', allowed: ALLOWED_STATUS } };
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

    const existing = await this.prisma.caseDocument.findFirst({
      where: { caseFileId: caseFile.id, docType },
    });

    const caseDocument = existing
      ? await this.prisma.caseDocument.update({
          where: { id: existing.id },
          data: {
            status,
            messageId: messageId ?? existing.messageId,
            notes: notes ?? existing.notes,
            receivedAt: status === 'RECEIVED' ? new Date() : existing.receivedAt,
            ...(messageId && messageId !== existing.messageId
              ? { extractionStatus: 'PENDING', extractedText: null, extractionMethod: null }
              : {}),
          },
        })
      : await this.prisma.caseDocument.create({
          data: {
            caseFileId: caseFile.id,
            docType,
            status,
            messageId,
            notes,
            receivedAt: status === 'RECEIVED' ? new Date() : null,
          },
        });

    let extractionQueued = false;
    if (status === 'RECEIVED' && messageId) {
      await this.extractionQueue.add('extract', { caseDocumentId: caseDocument.id });
      extractionQueued = true;
    }

    if (caseFile.status === 'TRIAGE') {
      await this.prisma.caseFile.update({
        where: { id: caseFile.id },
        data: { status: 'DOCS_PENDING' },
      });
    }

    this.logger.log(
      `IA registrou documento "${docType}" (${status}) na pasta ${caseFile.id}${extractionQueued ? ' — extração enfileirada' : ''}`,
    );

    return {
      output: {
        ok: true,
        caseDocumentId: caseDocument.id,
        extractionQueued,
      },
    };
  }
}
