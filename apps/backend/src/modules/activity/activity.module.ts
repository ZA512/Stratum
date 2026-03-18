import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { EventLogService } from './event-log.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ActivityService, EventLogService],
  controllers: [ActivityController],
  exports: [ActivityService, EventLogService],
})
export class ActivityModule {}
