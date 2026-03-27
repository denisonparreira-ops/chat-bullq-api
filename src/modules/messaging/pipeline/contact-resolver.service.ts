import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { NormalizedInboundMessage } from '../../channel-hub/ports/types';

export interface ResolvedContact {
  contactId: string;
  contactChannelId: string;
  isNew: boolean;
}

@Injectable()
export class ContactResolverService {
  private readonly logger = new Logger(ContactResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string,
    channelId: string,
    message: NormalizedInboundMessage,
  ): Promise<ResolvedContact> {
    const existing = await this.prisma.contactChannel.findUnique({
      where: {
        uq_contact_channel_external: {
          channelId,
          externalId: message.externalContactId,
        },
      },
      include: { contact: true },
    });

    if (existing) {
      const updates: Record<string, any> = {};
      if (message.contactName && message.contactName !== existing.profileName) {
        updates.profileName = message.contactName;
      }
      if (message.contactAvatarUrl && message.contactAvatarUrl !== existing.profileAvatarUrl) {
        updates.profileAvatarUrl = message.contactAvatarUrl;
      }
      if (Object.keys(updates).length > 0) {
        await this.prisma.contactChannel.update({
          where: { id: existing.id },
          data: updates,
        });
      }

      const contactUpdates: Record<string, any> = {};
      if (message.contactName && !existing.contact.name) {
        contactUpdates.name = message.contactName;
      }
      if (message.contactPhone && !existing.contact.phone) {
        contactUpdates.phone = message.contactPhone;
      }
      if (Object.keys(contactUpdates).length > 0) {
        await this.prisma.contact.update({
          where: { id: existing.contactId },
          data: contactUpdates,
        });
      }

      return {
        contactId: existing.contactId,
        contactChannelId: existing.id,
        isNew: false,
      };
    }

    const contact = await this.prisma.contact.create({
      data: {
        organizationId,
        name: message.contactName,
        phone: message.contactPhone,
        avatarUrl: message.contactAvatarUrl,
        channels: {
          create: {
            channelId,
            externalId: message.externalContactId,
            profileName: message.contactName,
            profileAvatarUrl: message.contactAvatarUrl,
          },
        },
      },
      include: { channels: true },
    });

    this.logger.log(`New contact created: ${contact.id} (${message.contactPhone || message.externalContactId})`);

    return {
      contactId: contact.id,
      contactChannelId: contact.channels[0].id,
      isNew: true,
    };
  }
}
