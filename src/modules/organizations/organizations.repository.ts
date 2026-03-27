import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.organization.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  async update(id: string, data: Prisma.OrganizationUpdateInput) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  async findMembers(organizationId: string) {
    return this.prisma.userOrganization.findMany({
      where: { organizationId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, isActive: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async findMembership(userId: string, organizationId: string) {
    return this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
  }

  async addMember(organizationId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') {
    return this.prisma.userOrganization.create({
      data: { organizationId, userId, role },
    });
  }

  async updateMemberRole(membershipId: string, role: 'OWNER' | 'ADMIN' | 'AGENT') {
    return this.prisma.userOrganization.update({
      where: { id: membershipId },
      data: { role },
    });
  }

  async removeMember(membershipId: string) {
    return this.prisma.userOrganization.delete({
      where: { id: membershipId },
    });
  }

  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async countMembers(organizationId: string) {
    return this.prisma.userOrganization.count({ where: { organizationId } });
  }
}
