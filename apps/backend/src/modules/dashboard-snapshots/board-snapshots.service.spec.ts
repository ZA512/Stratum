import { Test, TestingModule } from '@nestjs/testing';
import { ColumnBehaviorKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardSnapshotsService } from './board-snapshots.service';

interface PrismaMock extends PrismaService {
  board: { findMany: jest.Mock };
  column: { findMany: jest.Mock };
  node: { findMany: jest.Mock };
  boardDailySnapshot: {
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    upsert: jest.Mock;
  };
}

function createMockPrisma(): PrismaMock {
  const mock = {
    board: { findMany: jest.fn() },
    column: { findMany: jest.fn() },
    node: { findMany: jest.fn() },
    boardDailySnapshot: {
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
  } as unknown as PrismaMock;

  return mock;
}

describe('BoardSnapshotsService', () => {
  let service: BoardSnapshotsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardSnapshotsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(BoardSnapshotsService);

    prisma.board.findMany.mockResolvedValue([{ id: 'board-1' }]);
    prisma.column.findMany.mockResolvedValue([
      { id: 'col-1', behavior: { key: ColumnBehaviorKey.BACKLOG } },
      { id: 'col-2', behavior: { key: ColumnBehaviorKey.IN_PROGRESS } },
      { id: 'col-3', behavior: { key: ColumnBehaviorKey.DONE } },
    ]);
    prisma.node.findMany.mockResolvedValue([
      { columnId: 'col-1' },
      { columnId: 'col-1' },
      { columnId: 'col-2' },
      { columnId: 'col-3' },
    ]);
    prisma.boardDailySnapshot.deleteMany.mockResolvedValue({ count: 0 });
    prisma.boardDailySnapshot.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('computes metrics and creates snapshot for the day', async () => {
    prisma.boardDailySnapshot.findFirst.mockResolvedValue(null);

    const result = await service.buildDailySnapshots(
      new Date('2025-01-03T12:00:00Z'),
    );

    expect(result.snapshotDate.toISOString()).toBe('2025-01-03T00:00:00.000Z');
    expect(result.processedBoards).toBe(1);

    expect(prisma.boardDailySnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        dateUTC: { lt: new Date('2024-10-05T00:00:00.000Z') },
      },
    });

    expect(prisma.node.findMany).toHaveBeenCalledWith({
      where: {
        columnId: { in: ['col-1', 'col-2', 'col-3'] },
        archivedAt: null,
      },
      select: { columnId: true },
    });

    expect(prisma.boardDailySnapshot.upsert).toHaveBeenCalledWith({
      where: {
        boardId_dateUTC: {
          boardId: 'board-1',
          dateUTC: new Date('2025-01-03T00:00:00.000Z'),
        },
      },
      create: {
        boardId: 'board-1',
        dateUTC: new Date('2025-01-03T00:00:00.000Z'),
        backlog: 2,
        inProgress: 1,
        blocked: 0,
        done: 1,
        total: 4,
      },
      update: {
        backlog: 2,
        inProgress: 1,
        blocked: 0,
        done: 1,
        total: 4,
      },
    });
  });

  it('fills missing days when the previous snapshot is outdated', async () => {
    prisma.boardDailySnapshot.findFirst.mockResolvedValue({
      dateUTC: new Date('2025-01-02T00:00:00Z'),
    });

    await service.buildDailySnapshots(new Date('2025-01-05T06:30:00Z'));

    const upsertDates = prisma.boardDailySnapshot.upsert.mock.calls.map(
      (call) =>
        call[0].where.boardId_dateUTC.dateUTC.toISOString(),
    );

    expect(upsertDates).toEqual(
      expect.arrayContaining([
        '2025-01-03T00:00:00.000Z',
        '2025-01-04T00:00:00.000Z',
        '2025-01-05T00:00:00.000Z',
      ]),
    );
  });

  it('returns metrics for boards even without matching behaviors', async () => {
    prisma.node.findMany.mockResolvedValue([
      { columnId: 'col-1' },
      { columnId: 'unknown' },
    ]);

    const metrics = await service.computeBoardMetrics('board-1');

    expect(metrics).toEqual({
      backlog: 1,
      inProgress: 0,
      blocked: 0,
      done: 0,
      total: 2,
    });
  });
});
