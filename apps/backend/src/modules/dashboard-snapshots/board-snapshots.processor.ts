import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BoardSnapshotsService } from './board-snapshots.service';
import { BOARD_SNAPSHOTS_QUEUE } from './board-snapshots.tokens';

export interface BoardSnapshotsJobData {
  date?: string;
}

@Processor(BOARD_SNAPSHOTS_QUEUE)
export class BoardSnapshotsProcessor extends WorkerHost {
  constructor(private readonly snapshotsService: BoardSnapshotsService) {
    super();
  }

  async process(job: Job<BoardSnapshotsJobData>): Promise<unknown> {
    const targetDate = job.data?.date ? new Date(job.data.date) : new Date();
    return this.snapshotsService.buildDailySnapshots(targetDate);
  }
}
