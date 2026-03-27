import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, CurrentOrg, Roles } from '../../common/decorators';

@ApiTags('Organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current organization details' })
  getCurrent(@CurrentOrg('id') orgId: string) {
    return this.service.getOrganization(orgId);
  }

  @Patch('current')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update current organization' })
  update(@CurrentOrg('id') orgId: string, @Body() dto: UpdateOrganizationDto) {
    return this.service.updateOrganization(orgId, dto);
  }

  @Get('members')
  @ApiOperation({ summary: 'List members of current organization' })
  getMembers(@CurrentOrg('id') orgId: string) {
    return this.service.getMembers(orgId);
  }

  @Post('members/invite')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Invite a member to the organization' })
  invite(
    @CurrentOrg('id') orgId: string,
    @Body() dto: InviteMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.inviteMember(orgId, dto, userId);
  }

  @Patch('members/:memberId/role')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Change member role' })
  updateRole(
    @CurrentOrg('id') orgId: string,
    @CurrentOrg('userRole') actorRole: OrgRole,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.service.updateMemberRole(orgId, memberId, dto, actorRole);
  }

  @Delete('members/:memberId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  removeMember(
    @CurrentOrg('id') orgId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.service.removeMember(orgId, memberId, actorId);
  }
}
