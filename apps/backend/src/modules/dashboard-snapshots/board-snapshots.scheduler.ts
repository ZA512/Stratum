import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  BOARD_SNAPSHOTS_JOB_ID,
  BOARD_SNAPSHOTS_QUEUE,
} from './board-snapshots.tokens';

@Injectable()
export class BoardSnapshotsScheduler implements OnModuleInit {
  private readonly logger = new Logger(BoardSnapshotsScheduler.name);

  constructor(
    @InjectQueue(BOARD_SNAPSHOTS_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        'daily-scan',
        {},
        {
          jobId: BOARD_SNAPSHOTS_JOB_ID,
          repeat: {
            pattern: '0 1 * * *',
            tz: 'UTC',
          },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        'Failed to register board snapshot cron',
        err.stack ?? err.message,
      );
    }
  }
}
