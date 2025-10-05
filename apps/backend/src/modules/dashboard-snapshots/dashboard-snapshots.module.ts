import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { BoardSnapshotsProcessor } from './board-snapshots.processor';
import { BoardSnapshotsScheduler } from './board-snapshots.scheduler';
import { BoardSnapshotsService } from './board-snapshots.service';
import { BOARD_SNAPSHOTS_QUEUE } from './board-snapshots.tokens';

function resolveRedisConnection() {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL };
  }

  const port = process.env.REDIS_PORT
    ? parseInt(process.env.REDIS_PORT, 10)
    : 6379;

  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port,
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  };
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule.forRoot({
      connection: resolveRedisConnection(),
    }),
    BullModule.registerQueue({
      name: BOARD_SNAPSHOTS_QUEUE,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    }),
  ],
  providers: [
    BoardSnapshotsService,
    BoardSnapshotsProcessor,
    BoardSnapshotsScheduler,
  ],
  exports: [BoardSnapshotsService],
})
export class DashboardSnapshotsModule {}
