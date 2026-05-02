import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiAgentKind } from '@prisma/client';
import { AiTool, toLlmDefinition } from './tool.types';
import { LlmToolDefinition } from '../llm/llm.types';
import { ReplyToConversationTool } from './builtin/reply-to-conversation.tool';
import { TransferToHumanTool } from './builtin/transfer-to-human.tool';
import { TagConversationTool } from './builtin/tag-conversation.tool';
import { ListAvailableAgentsTool } from './builtin/list-available-agents.tool';
import { DelegateToAgentTool } from './builtin/delegate-to-agent.tool';
import { HandBackToOrchestratorTool } from './builtin/hand-back-to-orchestrator.tool';

/**
 * Central catalog of every tool available to AI agents. Each tool is also
 * scoped to which agent kinds can use it — orchestrators get routing tools,
 * workers get hand-back tools, and shared tools (reply, transfer, tag) are
 * available to both.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly tools = new Map<string, AiTool>();
  private readonly scope = new Map<string, Set<AiAgentKind>>();

  constructor(
    reply: ReplyToConversationTool,
    transfer: TransferToHumanTool,
    tag: TagConversationTool,
    listAgents: ListAvailableAgentsTool,
    delegate: DelegateToAgentTool,
    handBack: HandBackToOrchestratorTool,
  ) {
    // Shared
    this.register(reply, ['ORCHESTRATOR', 'WORKER']);
    this.register(transfer, ['ORCHESTRATOR', 'WORKER']);
    this.register(tag, ['ORCHESTRATOR', 'WORKER']);

    // Orchestrator-only
    this.register(listAgents, ['ORCHESTRATOR']);
    this.register(delegate, ['ORCHESTRATOR']);

    // Worker-only
    this.register(handBack, ['WORKER']);

    this.logger.log(
      `Registered ${this.tools.size} built-in tools: ${[...this.tools.keys()].join(', ')}`,
    );
  }

  private register(tool: AiTool, kinds: AiAgentKind[]): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Duplicate tool registration: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    this.scope.set(tool.name, new Set(kinds));
  }

  get(name: string): AiTool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new NotFoundException(`Unknown tool: ${name}`);
    }
    return tool;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Returns LLM-format tool definitions filtered by the agent kind. */
  getLlmDefinitionsForKind(kind: AiAgentKind): LlmToolDefinition[] {
    return [...this.tools.values()]
      .filter((t) => this.scope.get(t.name)?.has(kind) ?? false)
      .map(toLlmDefinition);
  }

  /** Returns LLM-format tool definitions for a specific subset, by name. */
  getLlmDefinitions(names: string[]): LlmToolDefinition[] {
    return names
      .filter((n) => this.tools.has(n))
      .map((n) => toLlmDefinition(this.tools.get(n)!));
  }

  /** Validates whether a tool can be used by an agent of the given kind. */
  isAllowedForKind(toolName: string, kind: AiAgentKind): boolean {
    return this.scope.get(toolName)?.has(kind) ?? false;
  }
}
