import { ChannelType, Channel } from '@prisma/client';
import { NormalizedOutboundMessage, SendResult, RateLimitConfig } from './types';

export interface OutboundChannelPort {
  readonly channelType: ChannelType;

  sendMessage(
    channel: Channel,
    contactExternalId: string,
    message: NormalizedOutboundMessage,
  ): Promise<SendResult>;

  sendTypingIndicator(
    channel: Channel,
    contactExternalId: string,
  ): Promise<void>;

  getMediaUrl(channel: Channel, mediaId: string): Promise<string>;

  downloadMedia(channel: Channel, mediaId: string): Promise<Buffer>;

  getRateLimits(): RateLimitConfig;
}

export const OUTBOUND_CHANNEL_PORT = 'OUTBOUND_CHANNEL_PORT';
