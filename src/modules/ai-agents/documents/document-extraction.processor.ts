import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database/prisma.service';
import { DocumentExtractionService } from './document-extraction.service';

/** Queue name — register with `BullModule.registerQueue({ name: DOCUMENT_EXTRACTION_QUEUE })`. */
export const DOCUMENT_EXTRACTION_QUEUE = 'document-extraction';

export interface DocumentExtractionJobData {
  caseDocumentId: string;
}

/**
 * Worker assíncrono que roda a extração de conteúdo real de um documento
 * do caso (`recordCaseDocument` enfileira aqui). Não pode bloquear o turno
 * do agente — extração de PDF/visão pode levar alguns segundos.
 */
@Processor(DOCUMENT_EXTRACTION_QUEUE, { concurrency: 3 })
export class DocumentExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentExtractionProcessor.name);

  constructor(
    private readonly extraction: DocumentExtractionService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<DocumentExtractionJobData>): Promise<{ ok: boolean }> {
    const { caseDocumentId } = job.data;
    const outcome = await this.extraction.extractForCaseDocument(caseDocumentId);

    await this.prisma.caseDocument.update({
      where: { id: caseDocumentId },
      data: {
        extractionStatus: outcome.status,
        extractionMethod: outcome.method ?? null,
        extractedText: outcome.text ?? null,
      },
    });

    this.logger.log({
      msg: 'document_extraction_processed',
      caseDocumentId,
      status: outcome.status,
      method: outcome.method,
      error: outcome.error,
    });

    return { ok: outcome.status === 'EXTRACTED' };
  }
}
