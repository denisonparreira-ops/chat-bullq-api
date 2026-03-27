import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Res,
  Query,
  Logger,
  HttpCode,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import { Request, Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Public } from '../../common/decorators';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { ChannelsService } from './channels/channels.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookGatewayController {
  private readonly logger = new Logger(WebhookGatewayController.name);

  constructor(
    private readonly registry: ChannelAdapterRegistry,
    private readonly channelsService: ChannelsService,
    @InjectQueue('inbound-messages') private readonly inboundQueue: Queue,
  ) {}

  @Post(':channelType')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive webhook from channel provider' })
  @ApiParam({ name: 'channelType', enum: ChannelType })
  async handleWebhook(
    @Param('channelType') channelType: ChannelType,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ) {
    if (!this.registry.hasAdapter(channelType)) {
      this.logger.warn(`No adapter for channel type: ${channelType}`);
      return res.status(404).json({ error: 'Unsupported channel type' });
    }

    const adapter = this.registry.getInbound(channelType);
    const headers = req.headers as Record<string, string>;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    const channels = await this.channelsService.findActiveByType(channelType);

    if (channels.length === 0) {
      this.logger.warn(`No active channels for type: ${channelType}`);
      return res.status(200).json({ status: 'no_active_channels' });
    }

    const channel = channels[0];
    const isValid = adapter.validateWebhook(
      headers,
      rawBody,
      channel.webhookSecret || undefined,
    );
    if (!isValid) {
      this.logger.warn(`Invalid webhook signature for ${channelType}`);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const parseResult = adapter.parseWebhook(req.body);

    for (const message of parseResult.messages) {
      await this.inboundQueue.add('process-inbound', {
        channelId: channel.id,
        organizationId: channel.organizationId,
        message,
      });
      this.logger.log(
        `Enqueued inbound message: ${message.externalMessageId} from ${channelType}`,
      );
    }

    for (const status of parseResult.statuses) {
      await this.inboundQueue.add('process-status', {
        channelId: channel.id,
        status,
      });
    }

    return res.status(200).json({ status: 'ok' });
  }

  @Get(':channelType/verify')
  @Public()
  @ApiOperation({ summary: 'Webhook verification (Meta challenge)' })
  @ApiParam({ name: 'channelType', enum: ChannelType })
  async handleVerification(
    @Param('channelType') channelType: ChannelType,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    if (!this.registry.hasAdapter(channelType)) {
      return res.status(404).json({ error: 'Unsupported channel type' });
    }

    const adapter = this.registry.getInbound(channelType);

    if (!adapter.handleVerification) {
      return res.status(200).json({ status: 'ok' });
    }

    const channels = await this.channelsService.findActiveByType(channelType);
    const webhookSecret = channels[0]?.webhookSecret || undefined;
    const result = adapter.handleVerification(query, webhookSecret);

    return res.status(result.statusCode).send(result.body);
  }
}
