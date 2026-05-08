import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../database/prisma.module';
import { PendingActionStorage } from './pending-action.storage';
import { PendingActionService } from './pending-action.service';
import { PendingActionController } from './pending-action.controller';

/**
 * Destructive-action confirmation module.
 *
 * Provides the infra for high-risk AI tools (grantAccess, resetPassword,
 * transferToHuman, ...) to create a `PendingAction` that requires human
 * approval before execution. Storage is Prisma-backed (`AiPendingAction`).
 */
@Module({
  imports: [PrismaModule],
  controllers: [PendingActionController],
  providers: [PendingActionStorage, PendingActionService],
  exports: [PendingActionService],
})
export class ConfirmationsModule {}
