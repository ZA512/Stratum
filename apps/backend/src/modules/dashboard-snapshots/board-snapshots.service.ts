import { Injectable, Logger } from '@nestjs/common';
import { ColumnBehaviorKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export type SnapshotCounts = {
  backlog: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
};

@Injectable()
export class BoardSnapshotsService {
  private readonly logger = new Logger(BoardSnapshotsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async buildDailySnapshots(date: Date = new Date()): Promise<{
    snapshotDate: Date;
    processedBoards: number;
  }> {
    const snapshotDate = startOfDayUtc(date);
    const retentionCutoff = addDaysUtc(snapshotDate, -90);

    await this.prisma.boardDailySnapshot.deleteMany({
      where: { dateUTC: { lt: retentionCutoff } },
    });

    const boards = await this.prisma.board.findMany({ select: { id: true } });
    let processed = 0;

    for (const board of boards) {
      try {
        const metrics = await this.computeBoardMetrics(board.id);
        await this.backfillSnapshots(board.id, snapshotDate, metrics);
        processed += 1;
      } catch (error) {
        this.logger.error(
          `Failed to build snapshot for board ${board.id}`,
          (error as Error).stack,
        );
      }
    }

    return { snapshotDate, processedBoards: processed };
  }

  private async backfillSnapshots(
    boardId: string,
    targetDate: Date,
    metrics: SnapshotCounts,
  ): Promise<void> {
    const datesToEnsure = new Map<number, Date>();
    datesToEnsure.set(targetDate.getTime(), targetDate);

    const lastSnapshot = await this.prisma.boardDailySnapshot.findFirst({
      where: {
        boardId,
        dateUTC: { lt: targetDate },
      },
      orderBy: { dateUTC: 'desc' },
    });

    if (lastSnapshot) {
      let cursor = startOfDayUtc(lastSnapshot.dateUTC);
      cursor = addDaysUtc(cursor, 1);

      while (cursor <= targetDate) {
        datesToEnsure.set(cursor.getTime(), cursor);
        cursor = addDaysUtc(cursor, 1);
      }
    }

    for (const date of datesToEnsure.values()) {
      await this.prisma.boardDailySnapshot.upsert({
        where: { boardId_dateUTC: { boardId, dateUTC: date } },
        create: { boardId, dateUTC: date, ...metrics },
        update: { ...metrics },
      });
    }
  }

  async computeBoardMetrics(boardId: string): Promise<SnapshotCounts> {
    const columns = await this.prisma.column.findMany({
      where: { boardId },
      select: {
        id: true,
        behavior: {
          select: { key: true },
        },
      },
    });

    const behaviorByColumn = new Map<string, ColumnBehaviorKey>();
    for (const column of columns) {
      if (column.behavior?.key) {
        behaviorByColumn.set(column.id, column.behavior.key);
      }
    }

    const columnIds = columns.map((column) => column.id);
    const nodes = columnIds.length
      ? await this.prisma.node.findMany({
          where: {
            columnId: { in: columnIds },
            archivedAt: null,
          },
          select: { columnId: true },
        })
      : [];

    const metrics: SnapshotCounts = {
      backlog: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      total: 0,
    };

    for (const node of nodes) {
      metrics.total += 1;
      const behaviorKey = node.columnId
        ? behaviorByColumn.get(node.columnId)
        : undefined;

      switch (behaviorKey) {
        case ColumnBehaviorKey.BACKLOG:
          metrics.backlog += 1;
          break;
        case ColumnBehaviorKey.IN_PROGRESS:
          metrics.inProgress += 1;
          break;
        case ColumnBehaviorKey.BLOCKED:
          metrics.blocked += 1;
          break;
        case ColumnBehaviorKey.DONE:
          metrics.done += 1;
          break;
        default:
          break;
      }
    }

    return metrics;
  }
}

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MS);
}
