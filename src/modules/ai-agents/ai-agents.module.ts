import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../database/prisma.module';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';
import { PromptBuilderService } from './runner/prompt-builder.service';
import { AiAgentRunnerService } from './runner/agent-runner.service';
import { AgentRouterService } from './router/agent-router.service';
import { AgentsService } from './agents/agents.service';
import { AgentsController } from './agents/agents.controller';
import { ToolsCatalogService } from './catalog/tools.service';
import { SkillsCatalogService } from './catalog/skills.service';
import { AiCatalogController } from './catalog/catalog.controller';

@Module({
  imports: [ConfigModule, PrismaModule, LlmModule, ToolsModule],
  controllers: [AgentsController, AiCatalogController],
  providers: [
    PromptBuilderService,
    AiAgentRunnerService,
    AgentRouterService,
    AgentsService,
    ToolsCatalogService,
    SkillsCatalogService,
  ],
  exports: [AiAgentRunnerService, AgentRouterService],
})
export class AiAgentsModule {}
