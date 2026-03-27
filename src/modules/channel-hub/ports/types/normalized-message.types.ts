import { ChannelType } from '@prisma/client';

export enum MessageContentType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  STICKER = 'STICKER',
  LOCATION = 'LOCATION',
  REACTION = 'REACTION',
  TEMPLATE = 'TEMPLATE',
  INTERACTIVE = 'INTERACTIVE',
  SYSTEM = 'SYSTEM',
}

export interface NormalizedMessageContent {
  text?: string;
  mediaUrl?: string;
  mediaId?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  caption?: string;
  latitude?: number;
  longitude?: number;
  reaction?: { emoji: string; targetMessageId: string };
  interactive?: { type: string; buttonId?: string; listRowId?: string };
}

export interface NormalizedInboundMessage {
  externalMessageId: string;
  externalContactId: string;
  contactName?: string;
  contactPhone?: string;
  contactAvatarUrl?: string;
  channelType: ChannelType;
  timestamp: Date;
  type: MessageContentType;
  content: NormalizedMessageContent;
  replyTo?: { externalMessageId: string };
  isForwarded?: boolean;
  rawPayload: unknown;
}

export interface NormalizedOutboundMessage {
  type: MessageContentType;
  content: NormalizedMessageContent;
  replyTo?: { externalMessageId: string };
}

export interface StatusUpdate {
  externalMessageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  errorMessage?: string;
}

export interface WebhookParseResult {
  messages: NormalizedInboundMessage[];
  statuses: StatusUpdate[];
  errors: WebhookError[];
}

export interface WebhookError {
  code: string;
  message: string;
  rawData?: unknown;
}

export interface VerificationResponse {
  statusCode: number;
  body: string | Record<string, unknown>;
}
