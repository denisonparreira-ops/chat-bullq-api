import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { InboundChannelPort } from './ports/inbound-channel.port';
import { OutboundChannelPort } from './ports/outbound-channel.port';

@Injectable()
export class ChannelAdapterRegistry {
  private readonly logger = new Logger(ChannelAdapterRegistry.name);
  private inboundAdapters = new Map<ChannelType, InboundChannelPort>();
  private outboundAdapters = new Map<ChannelType, OutboundChannelPort>();

  register(
    inbound: InboundChannelPort,
    outbound: OutboundChannelPort,
  ): void {
    const type = inbound.channelType;
    this.inboundAdapters.set(type, inbound);
    this.outboundAdapters.set(type, outbound);
    this.logger.log(`Adapter registered: ${type}`);
  }

  getInbound(type: ChannelType): InboundChannelPort {
    const adapter = this.inboundAdapters.get(type);
    if (!adapter) {
      throw new NotFoundException(`No inbound adapter for channel type: ${type}`);
    }
    return adapter;
  }

  getOutbound(type: ChannelType): OutboundChannelPort {
    const adapter = this.outboundAdapters.get(type);
    if (!adapter) {
      throw new NotFoundException(`No outbound adapter for channel type: ${type}`);
    }
    return adapter;
  }

  hasAdapter(type: ChannelType): boolean {
    return this.inboundAdapters.has(type);
  }

  getSupportedTypes(): ChannelType[] {
    return Array.from(this.inboundAdapters.keys());
  }
}
