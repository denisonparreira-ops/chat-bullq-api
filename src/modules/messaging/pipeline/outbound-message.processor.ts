import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { MessageStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ChannelAdapterRegistry } from '../../channel-hub/channel-adapter.registry';
import { NormalizedOutboundMessage } from '../../channel-hub/ports/types';

interface OutboundJobData {
  messageId: string;
  channelId: string;
  contactExternalId: string;
  message: NormalizedOutboundMessage;
}

@Processor('outbound-messages', { concurrency: 5 })
export class OutboundMessageProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundMessageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: ChannelAdapterRegistry,
  ) {
    super();
  }

  async process(job: Job<OutboundJobData>): Promise<any> {
    const { messageId, channelId, contactExternalId, message } = job.data;

    const channel = await this.prisma.channel.findUniqueOrThrow({
      where: { id: channelId },
    });

    const adapter = this.adapterRegistry.getOutbound(channel.type);

    try {
      const result = await adapter.sendMessage(
        channel,
        contactExternalId,
        message,
      );

      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.SENT,
          externalId: result.externalId,
          sentAt: new Date(),
          metadata: { providerResponse: JSON.parse(JSON.stringify(result.providerResponse ?? null)) },
        },
      });

      this.logger.log(`Outbound sent: msg=${messageId} externalId=${result.externalId}`);

      return { success: true, externalId: result.externalId };
    } catch (error: any) {
      this.logger.error(`Outbound failed: msg=${messageId} - ${error.message}`);

      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.FAILED,
          failedReason: error.message,
        },
      });

      throw error;
    }
  }
}
