import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../../../database/prisma.service';
import { MediaUrlResolverService } from '../runner/media-url-resolver.service';

const VISION_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const VISION_MODEL = 'gpt-4o-mini';
const MIN_NATIVE_TEXT_LENGTH = 40;

export interface ExtractionOutcome {
  status: 'EXTRACTED' | 'FAILED' | 'UNSUPPORTED_FORMAT';
  method?: 'native_pdf_text' | 'vision_ocr';
  text?: string;
  error?: string;
}

/**
 * Lê o conteúdo real de um documento anexado (PDF ou foto) para a
 * conferência de documentação do agente jurídico. Não existia nenhuma
 * leitura de conteúdo de anexo na plataforma antes disso — `extractText()`
 * em `runner/prompt-builder.service.ts` só devolve `[documento enviado:
 * nome.pdf]`, o LLM nunca via o conteúdo.
 *
 * Estratégia, em ordem:
 *   1. PDF com camada de texto nativa (pdf-parse) — cobre a maioria dos
 *      documentos gerados digitalmente (contratos, comprovantes emitidos).
 *   2. Imagem (foto de documento, muito comum em anexo de WhatsApp) —
 *      OCR via modelo de visão da OpenAI (reaproveita OPENAI_API_KEY já
 *      configurada — cliente separado do Sakana usado pro chat).
 *   3. PDF escaneado sem camada de texto — NÃO SUPORTADO nesta fase
 *      (precisaria rasterizar página→imagem, o que exige binários nativos
 *      tipo poppler/ghostscript não presentes na imagem Alpine do
 *      Dockerfile). Marcado explicitamente como UNSUPPORTED_FORMAT em vez
 *      de falhar silenciosamente.
 */
@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);
  private readonly openai: OpenAI | null;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mediaUrlResolver: MediaUrlResolverService,
  ) {
    const apiKey =
      config.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      this.logger.warn(
        'No OPENAI_API_KEY set — document OCR/vision extraction will fail at runtime',
      );
      this.openai = null;
    } else {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async extractForCaseDocument(caseDocumentId: string): Promise<ExtractionOutcome> {
    const caseDocument = await this.prisma.caseDocument.findUnique({
      where: { id: caseDocumentId },
    });
    if (!caseDocument) {
      return { status: 'FAILED', error: 'case_document_not_found' };
    }
    if (!caseDocument.messageId) {
      return { status: 'FAILED', error: 'no_message_linked' };
    }

    const message = await this.prisma.message.findUnique({
      where: { id: caseDocument.messageId },
      include: { conversation: { include: { channel: true } } },
    });
    if (!message) {
      return { status: 'FAILED', error: 'message_not_found' };
    }

    const channelTypeByConversation = new Map<string, string>();
    if (message.conversation?.channel) {
      channelTypeByConversation.set(
        message.conversationId,
        message.conversation.channel.type,
      );
    }

    const resolved = await this.mediaUrlResolver.resolveMany(
      [message],
      channelTypeByConversation,
    );
    const media = resolved.get(message.id);
    if (!media?.url) {
      return { status: 'FAILED', error: 'media_url_unresolved' };
    }

    const mime = (media.mimeType ?? '').toLowerCase();

    if (mime === 'application/pdf' || media.url.toLowerCase().endsWith('.pdf')) {
      return this.extractFromPdf(media.url);
    }

    if (VISION_MIMES.has(mime) || message.type === 'IMAGE') {
      return this.extractFromImage(media.url, mime || 'image/jpeg');
    }

    return {
      status: 'UNSUPPORTED_FORMAT',
      error: `mime "${mime || 'desconhecido'}" não suportado para extração`,
    };
  }

  private async extractFromPdf(url: string): Promise<ExtractionOutcome> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const response = await fetch(url);
      if (!response.ok) {
        return { status: 'FAILED', error: `download failed (${response.status})` };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const parsed = await pdfParse(buffer);
      const text = (parsed.text ?? '').trim();

      if (text.length >= MIN_NATIVE_TEXT_LENGTH) {
        return { status: 'EXTRACTED', method: 'native_pdf_text', text };
      }

      // PDF sem camada de texto (provável scan). Rasterizar página→imagem
      // exigiria poppler/ghostscript, não disponível na imagem Docker
      // atual — deixamos explícito em vez de fingir que funcionou.
      this.logger.warn(
        `PDF at ${url} has no usable native text layer (${text.length} chars) — likely scanned, unsupported in this phase`,
      );
      return {
        status: 'UNSUPPORTED_FORMAT',
        error:
          'PDF escaneado sem camada de texto — extração de imagem de PDF não suportada nesta fase',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`extractFromPdf failed for ${url}: ${message}`);
      return { status: 'FAILED', error: message };
    }
  }

  private async extractFromImage(
    url: string,
    mime: string,
  ): Promise<ExtractionOutcome> {
    if (!this.openai) {
      return { status: 'FAILED', error: 'OPENAI_API_KEY not configured' };
    }
    try {
      const response = await this.openai.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Transcreva integralmente o texto visível neste documento (é um anexo enviado por um cliente de um escritório de advocacia — pode ser RG, CPF, comprovante de residência, contrato, procuração, etc). ' +
                  'Devolva APENAS o texto transcrito, sem comentários, sem markdown, mantendo a estrutura de linhas o quanto possível. Se a imagem não contiver texto legível, responda exatamente: [sem texto legível].',
              },
              {
                type: 'image_url',
                image_url: { url },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0,
      });

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      if (!text || text === '[sem texto legível]') {
        return {
          status: 'UNSUPPORTED_FORMAT',
          error: 'nenhum texto legível identificado na imagem',
        };
      }
      return { status: 'EXTRACTED', method: 'vision_ocr', text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`extractFromImage failed for ${url}: ${message}`);
      return { status: 'FAILED', error: message };
    }
  }
}
