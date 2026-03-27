import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { WebhookGatewayController } from './webhook-gateway.controller';
import { ChannelsController } from './channels/channels.controller';
import { ChannelsService } from './channels/channels.service';
import { ChannelsRepository } from './channels/channels.repository';
import { ZappfyModule } from './adapters/zappfy/zappfy.module';
import { ZappfyInboundAdapter } from './adapters/zappfy/zappfy.inbound-adapter';
import { ZappfyOutboundAdapter } from './adapters/zappfy/zappfy.outbound-adapter';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'inbound-messages' },
      { name: 'outbound-messages' },
      { name: 'notifications' },
      { name: 'media-processor' },
      { name: 'chatbot-processor' },
      { name: 'conversation-router' },
      { name: 'sla-timers' },
    ),
    ZappfyModule,
  ],
  controllers: [WebhookGatewayController, ChannelsController],
  providers: [ChannelAdapterRegistry, ChannelsService, ChannelsRepository],
  exports: [ChannelAdapterRegistry, ChannelsService],
})
export class ChannelHubModule implements OnModuleInit {
  constructor(
    private readonly registry: ChannelAdapterRegistry,
    private readonly zappfyInbound: ZappfyInboundAdapter,
    private readonly zappfyOutbound: ZappfyOutboundAdapter,
  ) {}

  onModuleInit() {
    this.registry.register(this.zappfyInbound, this.zappfyOutbound);
  }
}
