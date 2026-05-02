import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { RealtimeGateway } from '../../../realtime/realtime.gateway';
import { AiTool, ToolContext, ToolResult } from '../tool.types';

/**
 * ORCHESTRATOR-only. Hands the conversation over to a WORKER agent. Sets
 * `conversation.activeAgentId` so the next inbound message routes directly
 * to the worker, and logs an AiAgentHandoff record. The worker takes over
 * fully — the orchestrator does NOT run again unless the worker explicitly
 * hands the conversation back via handBackToOrchestrator.
 */
@Injectable()
export class DelegateToAgentTool implements AiTool {
  private readonly logger = new Logger(DelegateToAgentTool.name);

  readonly name = 'delegateToAgent';
  readonly description =
    'Encaminha a conversa para um agente especialista que vai conduzir daqui em diante. Use depois de identificar a categoria certa via listAvailableAgents. Você (orquestrador) sai de cena — o worker assume.';
  readonly parameters = {
    type: 'object',
    additionalProperties: false,
    required: ['agentId', 'reason'],
    properties: {
      agentId: {
        type: 'string',
        description:
          'O ID exato do agente especialista (vem da resposta de listAvailableAgents.agents[].agentId).',
      },
      reason: {
        type: 'string',
        description:
          'Por que esse worker? Uma frase curta. Ex: "Lead é dono de escritório contábil em SP".',
        maxLength: 300,
      },
      briefing: {
        type: 'string',
        description:
          'Resumo do contexto que você já levantou pra que o worker comece já adiantado. Inclua o que o cliente disse, dores percebidas, tamanho da operação. Markdown não, só texto corrido.',
        maxLength: 1500,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async execute(
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const targetAgentId = String(input.agentId ?? '').trim();
    const reason = String(input.reason ?? '').trim();
    const briefing = input.briefing ? String(input.briefing).trim() : null;

    if (!targetAgentId) {
      return { output: { ok: false, error: 'agentId is required' } };
    }

    const target = await this.prisma.aiAgent.findFirst({
      where: {
        id: targetAgentId,
        organizationId: ctx.organizationId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, kind: true },
    });

    if (!target) {
      return {
        output: {
          ok: false,
          error: `Agent ${targetAgentId} not found in this organization or is inactive`,
        },
      };
    }

    if (target.kind !== 'WORKER') {
      return {
        output: {
          ok: false,
          error: `Cannot delegate to ${target.name}: only WORKER agents accept delegation.`,
        },
      };
    }

    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: ctx.conversationId },
        data: { activeAgentId: target.id },
      }),
      this.prisma.aiAgentHandoff.create({
        data: {
          conversationId: ctx.conversationId,
          fromAgentId: ctx.agentId,
          toAgentId: target.id,
          reason,
          briefing,
        },
      }),
      this.prisma.conversationAuditLog.create({
        data: {
          conversationId: ctx.conversationId,
          actorId: null,
          action: 'AI_DELEGATED',
          metadata: {
            fromAgentId: ctx.agentId,
            toAgentId: target.id,
            reason,
            runId: ctx.runId,
          },
        },
      }),
    ]);

    this.realtime.emitToConversation(
      ctx.conversationId,
      'conversation:ai-delegated',
      {
        conversationId: ctx.conversationId,
        toAgentId: target.id,
        toAgentName: target.name,
        reason,
      },
    );

    this.logger.log(
      `Orchestrator ${ctx.agentId} delegated conv ${ctx.conversationId} → ${target.name} (${target.id}): ${reason}`,
    );

    return {
      output: {
        ok: true,
        delegatedTo: { agentId: target.id, name: target.name },
        message:
          'Delegação concluída. O worker assumiu — você não precisa responder mais nessa conversa, a próxima mensagem do cliente vai direto para ele.',
      },
      finalAction: 'DELEGATED',
    };
  }
}
