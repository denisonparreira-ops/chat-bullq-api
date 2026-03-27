import { ChannelType } from '@prisma/client';
import {
  WebhookParseResult,
  VerificationResponse,
} from './types';

export interface InboundChannelPort {
  readonly channelType: ChannelType;

  validateWebhook(
    headers: Record<string, string>,
    rawBody: Buffer,
    webhookSecret?: string,
  ): boolean;

  parseWebhook(payload: unknown): WebhookParseResult;

  handleVerification?(
    query: Record<string, string>,
    webhookSecret?: string,
  ): VerificationResponse;
}

export const INBOUND_CHANNEL_PORT = 'INBOUND_CHANNEL_PORT';
