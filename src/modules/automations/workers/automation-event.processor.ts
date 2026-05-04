import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OutboxEventStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AUTOMATION_QUEUE } from '../automations.constants';
import { AutomationJobData } from '../automations.types';
import { KillSwitchService } from '../kill-switch.service';

// PR 1 worker: drains the queue without executing any actions yet.
// Its job is to prove the pipe: outbox row → claimed → enqueued → processed.
// PR 2 will swap the body of `process()` for the real executor (matching
// rules, lock acquisition, action runner, run logging).
//
// Even as a no-op, this MUST mark events PROCESSED so the outbox table
// doesn't grow without bound between PR 1 and PR 2 deploys.
@Processor(AUTOMATION_QUEUE, {
  concurrency: 4,
  // We don't want stuck jobs to block forever. BullMQ's stalled-check
  // recovers them automatically.
})
export class AutomationEventProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationEventProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitch: KillSwitchService,
  ) {
    super();
  }

  async process(job: Job<AutomationJobData>): Promise<void> {
    const { outboxEventId, trigger, organizationId } = job.data;

    // Defense-in-depth: the poller already checks the kill switch, but
    // a job could be in flight when the switch flipped. Bail explicitly.
    if (!this.killSwitch.isEnabled()) {
      await this.markProcessed(outboxEventId, 'kill_switch_disabled');
      return;
    }

    // PR 1: no rules engine yet. Acknowledge, log, move on. This branch
    // gets replaced in PR 2 with the real executor — the contract is the
    // same (mark the outbox row PROCESSED with finishedAt set).
    this.logger.debug(
      `[no-op PR1] received ${trigger} for org=${organizationId} outbox=${outboxEventId}`,
    );
    await this.markProcessed(outboxEventId, 'pr1_no_executor');
  }

  private async markProcessed(outboxEventId: string, note: string) {
    await this.prisma.outboxEvent.update({
      where: { id: outboxEventId },
      data: {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: note,
      },
    });
  }
}
