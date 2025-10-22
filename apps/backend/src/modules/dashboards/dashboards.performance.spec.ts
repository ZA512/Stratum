import { ColumnBehaviorKey, Priority } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_DASHBOARD_PREFERENCES } from '../user-settings/user-settings.types';
import { UserSettingsService } from '../user-settings/user-settings.service';
import { DashboardsService } from './dashboards.service';
import { DashboardsTelemetryService } from './dashboards.telemetry';
import { DASHBOARD_WIDGET_REGISTRY } from './dashboards.tokens';
import { DEFAULT_WIDGET_REGISTRY } from './dashboards.registry';

type PrismaMock = Pick<
  PrismaService,
  'board' | 'boardDailySnapshot' | 'column' | 'node'
>;

describe('DashboardsService performance budgets', () => {
  let service: DashboardsService;
  let prisma: PrismaMock;
  let userSettings: { getOrDefault: jest.Mock };
  let telemetry: {
    recordDashboard: jest.Mock;
    recordWidget: jest.Mock;
    recordWidgetError: jest.Mock;
    getWidgetErrorCounts: jest.Mock;
  };

  const now = new Date('2025-05-01T12:00:00Z');
  const rootBoard = {
    id: 'board-root',
    ownerUserId: 'user-1',
    node: {
      id: 'node-root',
      title: 'Root',
      path: '/root',
      depth: 0,
      parentId: null,
    },
  };
  const children = [
    {
      id: 'board-child-a',
      ownerUserId: 'user-1',
      node: {
        id: 'node-child-a',
        title: 'Child A',
        path: '/root/a',
        depth: 1,
        parentId: 'node-root',
      },
    },
    {
      id: 'board-child-b',
      ownerUserId: 'user-1',
      node: {
        id: 'node-child-b',
        title: 'Child B',
        path: '/root/b',
        depth: 1,
        parentId: 'node-root',
      },
    },
  ];

  const boards = [rootBoard, ...children];

  const columnDefinitions = boards.flatMap((board, index) => {
    const suffix = board.id.split('-').pop();
    return [
      { id: `col-${suffix}-backlog`, behavior: ColumnBehaviorKey.BACKLOG },
      { id: `col-${suffix}-inprogress`, behavior: ColumnBehaviorKey.IN_PROGRESS },
      { id: `col-${suffix}-blocked`, behavior: ColumnBehaviorKey.BLOCKED },
      { id: `col-${suffix}-done`, behavior: ColumnBehaviorKey.DONE },
    ].map((column, position) => ({
      id: column.id,
      boardId: board.id,
      name: `${board.node.title} ${column.behavior}`,
      position,
      wipLimit: position === 1 ? 8 : null,
      behavior: { key: column.behavior },
    }));
  });

  const columnById = new Map(columnDefinitions.map((column) => [column.id, column]));

  const taskNodes = boards.flatMap((board, boardIndex) => {
    const suffix = board.id.split('-').pop();
    const baseCreatedAt = new Date(now.getTime() - (boardIndex + 1) * 2 * 86_400_000);
    return Array.from({ length: 60 }).map((_, index) => {
      const columnCycle = index % 4;
      const columnBehavior =
        columnCycle === 0
          ? ColumnBehaviorKey.IN_PROGRESS
          : columnCycle === 1
          ? ColumnBehaviorKey.BLOCKED
          : columnCycle === 2
          ? ColumnBehaviorKey.BACKLOG
          : ColumnBehaviorKey.DONE;
      const columnId = `col-${suffix}-${
        columnBehavior === ColumnBehaviorKey.IN_PROGRESS
          ? 'inprogress'
          : columnBehavior === ColumnBehaviorKey.BLOCKED
          ? 'blocked'
          : columnBehavior === ColumnBehaviorKey.BACKLOG
          ? 'backlog'
          : 'done'
      }`;
      const createdAt = new Date(baseCreatedAt.getTime() + index * 3_600_000);
      const updatedAt = new Date(createdAt.getTime() + 2_700_000);
      const dueAt = index % 5 === 0 ? new Date(now.getTime() + 2 * 86_400_000) : null;
      const blockedSince =
        columnBehavior === ColumnBehaviorKey.BLOCKED
          ? new Date(now.getTime() - 3 * 86_400_000)
          : null;
      return {
        id: `${board.id}-task-${index}`,
        columnId,
        column: columnById.get(columnId) ?? {
          boardId: board.id,
          name: 'Column',
          behavior: { key: columnBehavior },
        },
        parentId: board.node.id,
        title: `Task ${board.node.title} #${index}`,
        description: index % 6 === 0 ? '' : `Description ${index}`,
        dueAt,
        startAt: createdAt,
        blockedSince,
        blockedReason: blockedSince ? 'Investigation' : null,
        blockedExpectedUnblockAt: blockedSince
          ? new Date(now.getTime() + 86_400_000)
          : null,
        isBlockResolved: false,
        progress: columnBehavior === ColumnBehaviorKey.DONE ? 100 : (index % 50) + 1,
        effort: index % 3 === 0 ? (index % 8) + 1 : null,
        priority:
          index % 10 === 0
            ? Priority.CRITICAL
            : index % 3 === 0
            ? Priority.HIGH
            : Priority.MEDIUM,
        metadata: index % 7 === 0 ? { financials: { budget: 1000 } } : null,
        statusMetadata:
          columnBehavior === ColumnBehaviorKey.IN_PROGRESS
            ? { lastTransitionAt: new Date(now.getTime() - 12 * 3_600_000) }
            : null,
        path: `${board.node.path}/task-${index}`,
        depth: board.node.depth + 1,
        createdAt,
        updatedAt,
        archivedAt: null,
      };
    });
  });

  const snapshotsByBoard = new Map(
    boards.map((board, index) => {
      const base = now.getTime() - (index + 1) * 10 * 86_400_000;
      const snapshots = Array.from({ length: 10 }).map((_, day) => ({
        id: `${board.id}-snapshot-${day}`,
        boardId: board.id,
        dateUTC: new Date(base + day * 86_400_000),
        backlog: 30 + day,
        inProgress: 20 + day,
        blocked: 5 + (day % 3),
        done: 40 + day * 2,
        total: 95 + day * 3,
      }));
      return [board.id, snapshots];
    }),
  );

  beforeEach(async () => {
    prisma = {
      board: {
        findUnique: jest.fn().mockResolvedValue(rootBoard),
        findMany: jest.fn().mockImplementation(async () => children),
      },
      boardDailySnapshot: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const ids: string[] = where?.boardId?.in ?? [];
          return ids.flatMap((id) => snapshotsByBoard.get(id) ?? []);
        }),
      },
      column: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          const ids: string[] = where?.boardId?.in ?? [];
          return columnDefinitions.filter((column) => ids.includes(column.boardId));
        }),
      },
      node: {
        findMany: jest.fn().mockImplementation(async ({ where, cursor }) => {
          if (cursor) {
            return [];
          }
          const ids: string[] = where?.column?.boardId?.in ?? [];
          return taskNodes.filter((task) => ids.includes(task.column.boardId));
        }),
      },
    } as unknown as PrismaMock;

    userSettings = {
      getOrDefault: jest.fn().mockResolvedValue({
        userId: 'user-1',
        preferences: {
          ...DEFAULT_DASHBOARD_PREFERENCES,
        },
      }),
    };

    telemetry = {
      recordDashboard: jest.fn(),
      recordWidget: jest.fn(),
      recordWidgetError: jest.fn().mockReturnValue(0),
      getWidgetErrorCounts: jest.fn().mockReturnValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        DashboardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserSettingsService, useValue: userSettings },
        { provide: DASHBOARD_WIDGET_REGISTRY, useValue: DEFAULT_WIDGET_REGISTRY },
        { provide: DashboardsTelemetryService, useValue: telemetry },
      ],
    }).compile();

    service = module.get(DashboardsService);
  });

  it('répond en moins de 400ms pour un dashboard SELF', async () => {
    const start = process.hrtime.bigint();
    const response = await service.getDashboard({
      dashboard: 'EXECUTION',
      mode: 'SELF',
      boardId: 'board-root',
      userId: 'user-1',
    });
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);

    expect(response.widgets.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(400);
  });

  it('répond en moins de 900ms pour un dashboard AGGREGATED', async () => {
    const start = process.hrtime.bigint();
    const response = await service.getDashboard({
      dashboard: 'PROGRESS',
      mode: 'AGGREGATED',
      boardId: 'board-root',
      userId: 'user-1',
    });
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);

    expect(response.widgets.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(900);
  });
});
