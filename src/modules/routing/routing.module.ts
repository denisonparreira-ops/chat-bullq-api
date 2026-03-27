import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsService } from './departments/departments.service';
import { DepartmentsRepository } from './departments/departments.repository';
import { RouterService } from './router.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'conversation-router' }),
    MessagingModule,
  ],
  controllers: [DepartmentsController],
  providers: [DepartmentsRepository, DepartmentsService, RouterService],
  exports: [DepartmentsService, DepartmentsRepository, RouterService],
})
export class RoutingModule {}
