import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { OrganizationsRepository } from './organizations.repository';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly repository: OrganizationsRepository) {}

  async getOrganization(orgId: string) {
    const org = await this.repository.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrganization(orgId: string, dto: UpdateOrganizationDto) {
    await this.getOrganization(orgId);
    return this.repository.update(orgId, dto);
  }

  async getMembers(orgId: string) {
    return this.repository.findMembers(orgId);
  }

  async inviteMember(orgId: string, dto: InviteMemberDto, inviterId: string) {
    const user = await this.repository.findUserByEmail(dto.email);
    if (!user) {
      throw new NotFoundException('User with this email not found. They must register first.');
    }

    const existing = await this.repository.findMembership(user.id, orgId);
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    const membership = await this.repository.addMember(orgId, user.id, dto.role);
    this.logger.log(`User ${user.email} invited to org ${orgId} by ${inviterId}`);
    return membership;
  }

  async updateMemberRole(orgId: string, memberId: string, dto: UpdateMemberRoleDto, actorRole: OrgRole) {
    const membership = await this.repository.findMembership(memberId, orgId);
    if (!membership) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (membership.role === 'OWNER' && dto.role !== 'OWNER') {
      throw new ForbiddenException('Cannot change the role of the organization owner');
    }

    if (actorRole === 'ADMIN' && dto.role === 'OWNER') {
      throw new ForbiddenException('Only owners can assign the owner role');
    }

    return this.repository.updateMemberRole(membership.id, dto.role);
  }

  async removeMember(orgId: string, memberId: string, actorId: string) {
    const membership = await this.repository.findMembership(memberId, orgId);
    if (!membership) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (membership.role === 'OWNER') {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    if (memberId === actorId) {
      throw new BadRequestException('Cannot remove yourself. Transfer ownership first.');
    }

    await this.repository.removeMember(membership.id);
    this.logger.log(`Member ${memberId} removed from org ${orgId} by ${actorId}`);
  }
}
