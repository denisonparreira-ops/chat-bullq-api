import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { UpsertSkillDto } from './dto/upsert-skill.dto';

@Injectable()
export class SkillsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    return this.prisma.aiSkill.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        tools: { include: { tool: true } },
        _count: { select: { agents: true, versions: true } },
      },
    });
  }

  async findOne(organizationId: string, id: string) {
    const skill = await this.prisma.aiSkill.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        tools: { include: { tool: true } },
        agents: { include: { agent: { select: { id: true, name: true } } } },
      },
    });
    if (!skill) throw new NotFoundException('Skill not found');
    return skill;
  }

  async listVersions(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    return this.prisma.aiSkillVersion.findMany({
      where: { skillId: id },
      orderBy: { version: 'desc' },
    });
  }

  async create(
    organizationId: string,
    dto: UpsertSkillDto,
    actorId: string | null,
  ) {
    await this.assertToolsExist(organizationId, dto.toolIds);

    return this.prisma.$transaction(async (tx) => {
      const skill = await tx.aiSkill.create({
        data: {
          organizationId,
          name: dto.name,
          description: dto.description,
          category: dto.category,
          promptInstructions: dto.promptInstructions,
          isActive: dto.isActive ?? true,
          currentVersion: 1,
        },
      });

      if (dto.toolIds.length > 0) {
        await tx.aiSkillTool.createMany({
          data: dto.toolIds.map((toolId) => ({ skillId: skill.id, toolId })),
        });
      }

      await tx.aiSkillVersion.create({
        data: {
          skillId: skill.id,
          version: 1,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          promptInstructions: skill.promptInstructions,
          toolIds: dto.toolIds,
          changedById: actorId,
          changeNote: dto.changeNote ?? 'Skill criada',
        },
      });

      return skill;
    });
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpsertSkillDto,
    actorId: string | null,
  ) {
    const existing = await this.findOne(organizationId, id);
    await this.assertToolsExist(organizationId, dto.toolIds);

    const nextVersion = existing.currentVersion + 1;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.aiSkill.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          category: dto.category,
          promptInstructions: dto.promptInstructions,
          isActive: dto.isActive ?? true,
          currentVersion: nextVersion,
        },
      });

      // Replace tools.
      await tx.aiSkillTool.deleteMany({ where: { skillId: id } });
      if (dto.toolIds.length > 0) {
        await tx.aiSkillTool.createMany({
          data: dto.toolIds.map((toolId) => ({ skillId: id, toolId })),
        });
      }

      await tx.aiSkillVersion.create({
        data: {
          skillId: id,
          version: nextVersion,
          name: updated.name,
          description: updated.description,
          category: updated.category,
          promptInstructions: updated.promptInstructions,
          toolIds: dto.toolIds,
          changedById: actorId,
          changeNote: dto.changeNote ?? 'Skill atualizada',
        },
      });

      return updated;
    });
  }

  async softDelete(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.aiSkill.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── Agent ↔ skills/tools attachment ─────────────────────────────

  async setAgentSkills(
    organizationId: string,
    agentId: string,
    skillIds: string[],
  ) {
    await this.assertAgent(organizationId, agentId);
    if (skillIds.length > 0) {
      const valid = await this.prisma.aiSkill.count({
        where: {
          id: { in: skillIds },
          organizationId,
          deletedAt: null,
        },
      });
      if (valid !== skillIds.length) {
        throw new BadRequestException('Algum skillId não pertence à org.');
      }
    }
    await this.prisma.$transaction([
      this.prisma.aiAgentSkill.deleteMany({ where: { agentId } }),
      ...(skillIds.length > 0
        ? [
            this.prisma.aiAgentSkill.createMany({
              data: skillIds.map((skillId) => ({ agentId, skillId })),
            }),
          ]
        : []),
    ]);
  }

  async setAgentExtraTools(
    organizationId: string,
    agentId: string,
    toolIds: string[],
  ) {
    await this.assertAgent(organizationId, agentId);
    await this.assertToolsExist(organizationId, toolIds);
    await this.prisma.$transaction([
      this.prisma.aiAgentTool.deleteMany({ where: { agentId } }),
      ...(toolIds.length > 0
        ? [
            this.prisma.aiAgentTool.createMany({
              data: toolIds.map((toolId) => ({ agentId, toolId })),
            }),
          ]
        : []),
    ]);
  }

  // ─── private helpers ─────────────────────────────────────────────

  private async assertAgent(organizationId: string, agentId: string) {
    const agent = await this.prisma.aiAgent.findFirst({
      where: { id: agentId, organizationId, deletedAt: null },
    });
    if (!agent) throw new NotFoundException('Agent not found');
  }

  private async assertToolsExist(organizationId: string, toolIds: string[]) {
    if (toolIds.length === 0) return;
    const valid = await this.prisma.aiTool.count({
      where: {
        id: { in: toolIds },
        deletedAt: null,
        OR: [{ organizationId: null }, { organizationId }],
      },
    });
    if (valid !== toolIds.length) {
      throw new BadRequestException(
        'Algum toolId não existe ou não pertence à organização.',
      );
    }
  }
}
