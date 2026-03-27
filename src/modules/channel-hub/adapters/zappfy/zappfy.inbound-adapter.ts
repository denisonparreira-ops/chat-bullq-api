import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { InboundChannelPort } from '../../ports/inbound-channel.port';
import {
  WebhookParseResult,
  VerificationResponse,
} from '../../ports/types';
import { ZappfyMessageMapper } from './zappfy.message-mapper';

@Injectable()
export class ZappfyInboundAdapter implements InboundChannelPort {
  readonly channelType = ChannelType.WHATSAPP_ZAPPFY;
  private readonly logger = new Logger(ZappfyInboundAdapter.name);

  constructor(private readonly mapper: ZappfyMessageMapper) {}

  validateWebhook(
    headers: Record<string, string>,
    _rawBody: Buffer,
    webhookSecret?: string,
  ): boolean {
    if (!webhookSecret) return true;
    const token = headers['x-webhook-token'] || headers['token'];
    return token === webhookSecret;
  }

  parseWebhook(payload: unknown): WebhookParseResult {
    const result: WebhookParseResult = {
      messages: [],
      statuses: [],
      errors: [],
    };

    try {
      const event = payload as any;
      const eventType = event?.event;

      if (eventType === 'messages' || eventType === 'messages.upsert') {
        const normalized = this.mapper.normalizeInbound(event);
        if (normalized) {
          result.messages.push(normalized);
        }
      } else if (eventType === 'messages_update' || eventType === 'messages.update') {
        const status = this.mapper.normalizeStatus(event);
        if (status) {
          result.statuses.push(status);
        }
      }
    } catch (error: any) {
      this.logger.error(`Failed to parse Zappfy webhook: ${error.message}`);
      result.errors.push({
        code: 'PARSE_ERROR',
        message: error.message,
        rawData: payload,
      });
    }

    return result;
  }

  handleVerification(
    _query: Record<string, string>,
    _webhookSecret?: string,
  ): VerificationResponse {
    return { statusCode: 200, body: 'OK' };
  }
}
