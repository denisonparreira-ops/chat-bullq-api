import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { ChannelsRepository } from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelAdapterRegistry } from '../channel-adapter.registry';
import { ZappfyHttpClient } from '../adapters/zappfy/zappfy.http-client';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly repository: ChannelsRepository,
    private readonly adapterRegistry: ChannelAdapterRegistry,
    private readonly zappfyHttpClient: ZappfyHttpClient,
  ) {}

  async create(organizationId: string, dto: CreateChannelDto) {
    return this.repository.create({
      organizationId,
      type: dto.type,
      name: dto.name,
      config: dto.config,
      webhookSecret: dto.webhookSecret,
    });
  }

  async findAll(organizationId: string) {
    return this.repository.findByOrganization(organizationId);
  }

  async findOne(id: string, organizationId: string) {
    const channel = await this.repository.findById(id);
    if (!channel) throw new NotFoundException('Channel not found');
    if (channel.organizationId !== organizationId) {
      throw new ForbiddenException();
    }
    return channel;
  }

  async update(id: string, organizationId: string, dto: UpdateChannelDto) {
    await this.findOne(id, organizationId);
    return this.repository.update(id, dto);
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.repository.softDelete(id);
  }

  async findActiveByType(type: ChannelType) {
    return this.repository.findActiveByType(type);
  }

  async testConnection(id: string, organizationId: string) {
    const channel = await this.findOne(id, organizationId);

    if (channel.type === ChannelType.WHATSAPP_ZAPPFY) {
      try {
        const status = await this.zappfyHttpClient.getInstanceStatus(channel);
        return {
          success: true,
          status: status?.state || status?.status || 'connected',
          data: status,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.response?.data?.message || error.message,
        };
      }
    }

    return { success: false, error: 'Test not available for this channel type' };
  }
}
