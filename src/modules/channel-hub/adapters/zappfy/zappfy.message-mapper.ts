import { Injectable } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import {
  NormalizedInboundMessage,
  NormalizedOutboundMessage,
  MessageContentType,
  StatusUpdate,
} from '../../ports/types';

@Injectable()
export class ZappfyMessageMapper {
  normalizeInbound(event: any): NormalizedInboundMessage | null {
    const msg = event?.data;
    if (!msg) return null;

    const isFromMe = msg.key?.fromMe === true;
    if (isFromMe) return null;

    const remoteJid = msg.key?.remoteJid || '';
    const phone = remoteJid.replace(/@s\.whatsapp\.net|@g\.us/g, '');
    const pushName = msg.pushName || msg.key?.pushName || undefined;

    const result: NormalizedInboundMessage = {
      externalMessageId: msg.key?.id || msg.id || '',
      externalContactId: remoteJid,
      contactName: pushName,
      contactPhone: phone,
      channelType: ChannelType.WHATSAPP_ZAPPFY,
      timestamp: new Date(
        (msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000,
      ),
      type: this.resolveContentType(msg.message || msg),
      content: this.extractContent(msg.message || msg),
      isForwarded: !!msg.message?.contextInfo?.isForwarded,
      rawPayload: event,
    };

    if (msg.message?.contextInfo?.stanzaId) {
      result.replyTo = {
        externalMessageId: msg.message.contextInfo.stanzaId,
      };
    }

    return result;
  }

  normalizeStatus(event: any): StatusUpdate | null {
    const data = event?.data;
    if (!data?.key?.id) return null;

    const statusMap: Record<number, StatusUpdate['status']> = {
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'read',
      5: 'failed',
    };

    const status = statusMap[data.status];
    if (!status) return null;

    return {
      externalMessageId: data.key.id,
      status,
      timestamp: new Date(),
    };
  }

  denormalize(
    message: NormalizedOutboundMessage,
    contactExternalId: string,
  ): { endpoint: string; payload: Record<string, any> } {
    const number = contactExternalId.replace(/@s\.whatsapp\.net|@g\.us/g, '');

    switch (message.type) {
      case MessageContentType.TEXT:
        return {
          endpoint: '/send/text',
          payload: { number, text: message.content.text, delay: 1000 },
        };

      case MessageContentType.IMAGE:
        return {
          endpoint: '/send/media',
          payload: {
            number,
            media: message.content.mediaUrl,
            type: 'image',
            caption: message.content.caption || '',
          },
        };

      case MessageContentType.AUDIO:
        return {
          endpoint: '/send/media',
          payload: {
            number,
            media: message.content.mediaUrl,
            type: 'audio',
          },
        };

      case MessageContentType.VIDEO:
        return {
          endpoint: '/send/media',
          payload: {
            number,
            media: message.content.mediaUrl,
            type: 'video',
            caption: message.content.caption || '',
          },
        };

      case MessageContentType.DOCUMENT:
        return {
          endpoint: '/send/media',
          payload: {
            number,
            media: message.content.mediaUrl,
            type: 'document',
            caption: message.content.fileName || '',
          },
        };

      case MessageContentType.STICKER:
        return {
          endpoint: '/send/media',
          payload: {
            number,
            media: message.content.mediaUrl,
            type: 'sticker',
          },
        };

      case MessageContentType.LOCATION:
        return {
          endpoint: '/send/text',
          payload: {
            number,
            text: `📍 Location: ${message.content.latitude}, ${message.content.longitude}`,
          },
        };

      case MessageContentType.REACTION:
        return {
          endpoint: '/message/react',
          payload: {
            number,
            msgId: message.content.reaction?.targetMessageId,
            reaction: message.content.reaction?.emoji,
          },
        };

      default:
        return {
          endpoint: '/send/text',
          payload: { number, text: message.content.text || '' },
        };
    }
  }

  private resolveContentType(msg: any): MessageContentType {
    if (msg.conversation || msg.extendedTextMessage) return MessageContentType.TEXT;
    if (msg.imageMessage) return MessageContentType.IMAGE;
    if (msg.audioMessage) return MessageContentType.AUDIO;
    if (msg.videoMessage) return MessageContentType.VIDEO;
    if (msg.documentMessage || msg.documentWithCaptionMessage) return MessageContentType.DOCUMENT;
    if (msg.stickerMessage) return MessageContentType.STICKER;
    if (msg.locationMessage || msg.liveLocationMessage) return MessageContentType.LOCATION;
    if (msg.reactionMessage) return MessageContentType.REACTION;
    if (msg.buttonsResponseMessage || msg.listResponseMessage) return MessageContentType.INTERACTIVE;
    return MessageContentType.TEXT;
  }

  private extractContent(msg: any): NormalizedInboundMessage['content'] {
    if (msg.conversation) {
      return { text: msg.conversation };
    }
    if (msg.extendedTextMessage) {
      return { text: msg.extendedTextMessage.text };
    }
    if (msg.imageMessage) {
      return {
        mediaId: msg.imageMessage.mediaKey,
        mediaUrl: msg.imageMessage.url,
        mimeType: msg.imageMessage.mimetype,
        fileSize: msg.imageMessage.fileLength,
        caption: msg.imageMessage.caption,
      };
    }
    if (msg.audioMessage) {
      return {
        mediaId: msg.audioMessage.mediaKey,
        mediaUrl: msg.audioMessage.url,
        mimeType: msg.audioMessage.mimetype,
        fileSize: msg.audioMessage.fileLength,
      };
    }
    if (msg.videoMessage) {
      return {
        mediaId: msg.videoMessage.mediaKey,
        mediaUrl: msg.videoMessage.url,
        mimeType: msg.videoMessage.mimetype,
        fileSize: msg.videoMessage.fileLength,
        caption: msg.videoMessage.caption,
      };
    }
    if (msg.documentMessage) {
      return {
        mediaId: msg.documentMessage.mediaKey,
        mediaUrl: msg.documentMessage.url,
        mimeType: msg.documentMessage.mimetype,
        fileName: msg.documentMessage.fileName,
        fileSize: msg.documentMessage.fileLength,
      };
    }
    if (msg.documentWithCaptionMessage) {
      const doc = msg.documentWithCaptionMessage.message?.documentMessage;
      return {
        mediaId: doc?.mediaKey,
        mediaUrl: doc?.url,
        mimeType: doc?.mimetype,
        fileName: doc?.fileName,
        fileSize: doc?.fileLength,
        caption: doc?.caption,
      };
    }
    if (msg.stickerMessage) {
      return {
        mediaId: msg.stickerMessage.mediaKey,
        mediaUrl: msg.stickerMessage.url,
        mimeType: msg.stickerMessage.mimetype,
      };
    }
    if (msg.locationMessage) {
      return {
        latitude: msg.locationMessage.degreesLatitude,
        longitude: msg.locationMessage.degreesLongitude,
        text: msg.locationMessage.name || msg.locationMessage.address,
      };
    }
    if (msg.liveLocationMessage) {
      return {
        latitude: msg.liveLocationMessage.degreesLatitude,
        longitude: msg.liveLocationMessage.degreesLongitude,
      };
    }
    if (msg.reactionMessage) {
      return {
        reaction: {
          emoji: msg.reactionMessage.text,
          targetMessageId: msg.reactionMessage.key?.id || '',
        },
      };
    }
    if (msg.buttonsResponseMessage) {
      return {
        interactive: {
          type: 'button',
          buttonId: msg.buttonsResponseMessage.selectedButtonId,
        },
        text: msg.buttonsResponseMessage.selectedDisplayText,
      };
    }
    if (msg.listResponseMessage) {
      return {
        interactive: {
          type: 'list',
          listRowId: msg.listResponseMessage.singleSelectReply?.selectedRowId,
        },
        text: msg.listResponseMessage.title,
      };
    }
    return { text: '[Unsupported message type]' };
  }
}
