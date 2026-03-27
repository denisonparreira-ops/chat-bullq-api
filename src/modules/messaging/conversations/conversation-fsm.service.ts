import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConversationStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

type Transition = {
  from: ConversationStatus;
  to: ConversationStatus;
};

const VALID_TRANSITIONS: Transition[] = [
  { from: ConversationStatus.PENDING, to: ConversationStatus.OPEN },
  { from: ConversationStatus.PENDING, to: ConversationStatus.BOT },
  { from: ConversationStatus.BOT, to: ConversationStatus.PENDING },
  { from: ConversationStatus.OPEN, to: ConversationStatus.WAITING },
  { from: ConversationStatus.OPEN, to: ConversationStatus.CLOSED },
  { from: ConversationStatus.WAITING, to: ConversationStatus.OPEN },
  { from: ConversationStatus.WAITING, to: ConversationStatus.CLOSED },
  { from: ConversationStatus.CLOSED, to: ConversationStatus.OPEN },
  { from: ConversationStatus.CLOSED, to: ConversationStatus.PENDING },
];

@Injectable()
export class ConversationFsmService {
  private readonly logger = new Logger(ConversationFsmService.name);

  constructor(private readonly prisma: PrismaService) {}

  canTransition(from: ConversationStatus, to: ConversationStatus): boolean {
    return VALID_TRANSITIONS.some((t) => t.from === from && t.to === to);
  }

  async transition(
    conversationId: string,
    to: ConversationStatus,
    actorId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    const from = conversation.status;

    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid transition: ${from} → ${to}`,
      );
    }

    const updateData: Record<string, any> = { status: to };

    if (to === ConversationStatus.CLOSED) {
      updateData.closedAt = new Date();
    }
    if (to === ConversationStatus.OPEN && from === ConversationStatus.CLOSED) {
      updateData.closedAt = null;
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId,
        actorId,
        action: 'STATUS_CHANGED',
        fromValue: from,
        toValue: to,
        metadata: metadata || {},
      },
    });

    this.logger.log(`Conversation ${conversationId}: ${from} → ${to}`);
  }

  async assign(
    conversationId: string,
    agentId: string,
    actorId?: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });

    const updates: Record<string, any> = { assignedToId: agentId };

    if (conversation.status === ConversationStatus.PENDING) {
      updates.status = ConversationStatus.OPEN;
    }

    if (!conversation.firstResponseAt && conversation.status === ConversationStatus.PENDING) {
      updates.firstResponseAt = new Date();
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: updates,
    });

    await this.prisma.conversationAuditLog.create({
      data: {
        conversationId,
        actorId: actorId || agentId,
        action: 'ASSIGNED',
        fromValue: conversation.assignedToId,
        toValue: agentId,
      },
    });

    if (conversation.status === ConversationStatus.PENDING) {
      await this.prisma.conversationAuditLog.create({
        data: {
          conversationId,
          actorId: actorId || agentId,
          action: 'STATUS_CHANGED',
          fromValue: ConversationStatus.PENDING,
          toValue: ConversationStatus.OPEN,
        },
      });
    }
  }
}
