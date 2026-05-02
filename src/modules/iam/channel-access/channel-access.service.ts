import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type ChannelAccess = 'ALL' | Set<string>;

@Injectable()
export class ChannelAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isBypassRole(role: OrgRole): boolean {
    return role === OrgRole.OWNER || role === OrgRole.ADMIN;
  }

  async getAccessibleChannelIds(
    userOrganizationId: string,
    role: OrgRole,
  ): Promise<ChannelAccess> {
    if (this.isBypassRole(role)) return 'ALL';

    const rows = await this.prisma.channelAgent.findMany({
      where: { userOrganizationId },
      select: { channelId: true },
    });
    return new Set(rows.map((r) => r.channelId));
  }

  hasAccess(access: ChannelAccess, channelId: string): boolean {
    return access === 'ALL' || access.has(channelId);
  }

  assertChannelAccess(access: ChannelAccess, channelId: string): void {
    if (!this.hasAccess(access, channelId)) {
      throw new ForbiddenException('You do not have access to this channel');
    }
  }

  async assertConversationAccess(
    access: ChannelAccess,
    conversationId: string,
  ): Promise<void> {
    if (access === 'ALL') return;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { channelId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    this.assertChannelAccess(access, conversation.channelId);
  }

  /**
   * Look up the membership for a user in an org. Throws if not found.
   * Used by the admin endpoints that take `memberId` (a user id) in URL.
   */
  async getMembership(organizationId: string, userId: string) {
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { id: true, role: true, userId: true },
    });
    if (!membership) {
      throw new NotFoundException('Member not found in this organization');
    }
    return membership;
  }

  async listMemberChannels(organizationId: string, userId: string) {
    const membership = await this.getMembership(organizationId, userId);
    if (this.isBypassRole(membership.role)) {
      return {
        bypass: true as const,
        role: membership.role,
        channelIds: [] as string[],
      };
    }
    const grants = await this.prisma.channelAgent.findMany({
      where: { userOrganizationId: membership.id },
      select: { channelId: true },
    });
    return {
      bypass: false as const,
      role: membership.role,
      channelIds: grants.map((g) => g.channelId),
    };
  }

  /**
   * Replace the full set of channel grants for a member. Returns the diff
   * (added + removed) so callers can push live socket-room updates without
   * forcing a reconnect.
   */
  async setMemberChannels(
    organizationId: string,
    userId: string,
    channelIds: string[],
    grantedById: string,
  ): Promise<{ added: string[]; removed: string[]; userId: string }> {
    const membership = await this.getMembership(organizationId, userId);
    if (this.isBypassRole(membership.role)) {
      throw new BadRequestException(
        'OWNER and ADMIN already see all channels — channel grants do not apply.',
      );
    }

    const validChannels = await this.prisma.channel.findMany({
      where: { id: { in: channelIds }, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (validChannels.length !== channelIds.length) {
      throw new BadRequestException(
        'One or more channelIds are invalid for this organization.',
      );
    }

    const existing = await this.prisma.channelAgent.findMany({
      where: { userOrganizationId: membership.id },
      select: { channelId: true },
    });
    const existingSet = new Set(existing.map((e) => e.channelId));
    const targetSet = new Set(channelIds);

    const toAdd = channelIds.filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !targetSet.has(id));

    await this.prisma.$transaction([
      ...(toRemove.length
        ? [
            this.prisma.channelAgent.deleteMany({
              where: {
                userOrganizationId: membership.id,
                channelId: { in: toRemove },
              },
            }),
          ]
        : []),
      ...toAdd.map((channelId) =>
        this.prisma.channelAgent.create({
          data: {
            channelId,
            userOrganizationId: membership.id,
            grantedById,
          },
        }),
      ),
    ]);

    return { added: toAdd, removed: toRemove, userId: membership.userId };
  }

  async addChannelAgent(
    organizationId: string,
    channelId: string,
    userId: string,
    grantedById: string,
  ): Promise<{ userId: string }> {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const membership = await this.getMembership(organizationId, userId);
    if (this.isBypassRole(membership.role)) {
      throw new BadRequestException(
        'OWNER and ADMIN already see all channels — granting is unnecessary.',
      );
    }

    await this.prisma.channelAgent.upsert({
      where: {
        channelId_userOrganizationId: {
          channelId,
          userOrganizationId: membership.id,
        },
      },
      update: {},
      create: {
        channelId,
        userOrganizationId: membership.id,
        grantedById,
      },
    });

    return { userId: membership.userId };
  }

  async removeChannelAgent(
    organizationId: string,
    channelId: string,
    userId: string,
  ): Promise<{ userId: string }> {
    const membership = await this.getMembership(organizationId, userId);
    await this.prisma.channelAgent.deleteMany({
      where: {
        channelId,
        userOrganizationId: membership.id,
      },
    });
    return { userId: membership.userId };
  }

  async listChannelAgents(organizationId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const grants = await this.prisma.channelAgent.findMany({
      where: { channelId },
      include: {
        userOrganization: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
      },
    });
    return grants.map((g) => ({
      grantId: g.id,
      grantedAt: g.grantedAt,
      user: g.userOrganization.user,
      role: g.userOrganization.role,
    }));
  }

  /**
   * Members eligible to handle a conversation in the given channel — used by
   * the assignee picker. Includes OWNER/ADMIN (always eligible) and AGENTs
   * with an explicit grant. Excludes inactive users.
   */
  async listEligibleAgents(organizationId: string, channelId: string) {
    const channel = await this.prisma.channel.findFirst({
      where: { id: channelId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');

    const memberships = await this.prisma.userOrganization.findMany({
      where: {
        organizationId,
        user: { isActive: true, deletedAt: null },
        OR: [
          { role: { in: [OrgRole.OWNER, OrgRole.ADMIN] } },
          { channelAgents: { some: { channelId } } },
        ],
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
    });
    return memberships.map((m) => ({
      ...m.user,
      role: m.role,
    }));
  }
}
