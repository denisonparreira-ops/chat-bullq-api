import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../database/prisma.module';
import { OutboxService } from './outbox/outbox.service';
import { OutboxPollerService } from './outbox/outbox-poller.service';
import { AutomationEventProcessor } from './workers/automation-event.processor';
import { KillSwitchService } from './kill-switch.service';
import { AUTOMATION_QUEUE } from './automations.constants';

// Global so domain modules (TagsModule, MessagingModule, etc.) can inject
// `OutboxService` without each one having to import this module
// explicitly. The actual processor + poller are private to this module.
@Global()
@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: AUTOMATION_QUEUE }),
  ],
  providers: [
    KillSwitchService,
    OutboxService,
    OutboxPollerService,
    AutomationEventProcessor,
  ],
  exports: [OutboxService, KillSwitchService],
})
export class AutomationsModule {}
