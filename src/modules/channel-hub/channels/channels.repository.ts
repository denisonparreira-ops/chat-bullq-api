import { Injectable } from '@nestjs/common';
import { ChannelType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ChannelUncheckedCreateInput) {
    return this.prisma.channel.create({ data });
  }

  async findById(id: string) {
    return this.prisma.channel.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.channel.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByType(type: ChannelType) {
    return this.prisma.channel.findMany({
      where: { type, isActive: true, deletedAt: null },
    });
  }

  async findActiveByTypeAndOrg(type: ChannelType, organizationId: string) {
    return this.prisma.channel.findMany({
      where: { type, organizationId, isActive: true, deletedAt: null },
    });
  }

  async update(id: string, data: Prisma.ChannelUpdateInput) {
    return this.prisma.channel.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return this.prisma.channel.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
