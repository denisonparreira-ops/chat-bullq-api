import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../database/prisma.module';
import { ChannelHubModule } from '../../channel-hub/channel-hub.module';
import { MediaUrlResolverService } from '../runner/media-url-resolver.service';
import { DocumentExtractionService } from './document-extraction.service';
import {
  DocumentExtractionProcessor,
  DOCUMENT_EXTRACTION_QUEUE,
} from './document-extraction.processor';

/**
 * Extração de conteúdo real de documentos anexados (pasta de caso
 * jurídico). Declara `MediaUrlResolverService` como provider próprio (em
 * vez de importar de AiAgentsModule) pra evitar dependência circular —
 * ToolsModule (que registra `recordCaseDocument`) importa este módulo.
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => ChannelHubModule),
    BullModule.registerQueue({ name: DOCUMENT_EXTRACTION_QUEUE }),
  ],
  providers: [
    DocumentExtractionService,
    DocumentExtractionProcessor,
    MediaUrlResolverService,
  ],
  exports: [DocumentExtractionService, BullModule],
})
export class DocumentsModule {}
