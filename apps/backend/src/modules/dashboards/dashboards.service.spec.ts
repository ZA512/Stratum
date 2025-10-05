import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ColumnBehaviorKey, Effort, Priority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_DASHBOARD_PREFERENCES } from '../user-settings/user-settings.types';
import { UserSettingsService } from '../user-settings/user-settings.service';
import { DashboardsService } from './dashboards.service';
import { DashboardsTelemetryService } from './dashboards.telemetry';
import { DASHBOARD_WIDGET_REGISTRY } from './dashboards.tokens';
import { DashboardTask, WidgetDefinition } from './dashboards.types';

interface PrismaMock extends PrismaService {
  board: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
  node: {
    findMany: jest.Mock;
  };
  column: {
    findMany: jest.Mock;
  };
  boardDailySnapshot: {
    findMany: jest.Mock;
  };
  membership: {
    findFirst: jest.Mock;
  };
}

function createPrismaMock(): PrismaMock {
  return {
    board: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    node: {
      findMany: jest.fn(),
    },
    column: {
      findMany: jest.fn(),
    },
    boardDailySnapshot: {
      findMany: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
  } as unknown as PrismaMock;
}

describe('DashboardsService', () => {
  let service: DashboardsService;
  let prisma: PrismaMock;
  let userSettings: { getOrDefault: jest.Mock };
  let registry: WidgetDefinition[];
  let telemetry: {
    recordDashboard: jest.Mock;
    recordWidget: jest.Mock;
    recordWidgetError: jest.Mock;
    getWidgetErrorCounts: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    userSettings = { getOrDefault: jest.fn() };

    registry = [
      {
        id: 'test.ok',
        dashboard: 'EXECUTION',
        label: 'Ok',
        description: 'Ok widget',
        supportedModes: ['SELF', 'AGGREGATED', 'COMPARISON'],
        dataDependencies: { tasks: true, snapshots: false },
        async compute(ctx) {
          return {
            status: 'ok',
            payload: { taskCount: ctx.tasks.length },
          };
        },
      },
      {
        id: 'test.requirement',
        dashboard: 'EXECUTION',
        label: 'Needs Items',
        description: 'Needs many items',
        supportedModes: ['SELF', 'AGGREGATED'],
        dataDependencies: { tasks: true, snapshots: false },
        requirements: { minItems: 3 },
        compute: jest.fn(async () => ({ status: 'ok' })),
      },
      {
        id: 'test.coverage',
        dashboard: 'EXECUTION',
        label: 'Coverage',
        description: 'Requires field coverage',
        supportedModes: ['SELF'],
        dataDependencies: { tasks: true, snapshots: false },
        requirements: {
          minCoverage: [{ field: 'effort', ratio: 0.6 }],
        },
        compute: jest.fn(async () => ({ status: 'ok' })),
      },
    ];

    telemetry = {
      recordDashboard: jest.fn(),
      recordWidget: jest.fn(),
      recordWidgetError: jest.fn().mockReturnValue(1),
      getWidgetErrorCounts: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserSettingsService, useValue: userSettings },
        { provide: DASHBOARD_WIDGET_REGISTRY, useValue: registry },
        { provide: DashboardsTelemetryService, useValue: telemetry },
      ],
    }).compile();

    service = module.get(DashboardsService);

    prisma.membership.findFirst.mockResolvedValue({ id: 'membership-1' });
    prisma.board.findUnique.mockResolvedValue({
      id: 'board-1',
      node: {
        id: 'node-1',
        title: 'Board',
        teamId: 'team-1',
        path: '/node-1',
        depth: 0,
        parentId: null,
      },
    });
    prisma.board.findMany.mockResolvedValue([]);
    prisma.node.findMany.mockResolvedValue([
      {
        id: 'task-1',
        columnId: 'col-1',
        column: {
          boardId: 'board-1',
          behavior: { key: ColumnBehaviorKey.IN_PROGRESS },
          name: 'In Progress',
        },
        parentId: 'node-1',
        title: 'Task 1',
        description: 'Desc 1',
        dueAt: null,
        startAt: null,
        blockedSince: null,
        blockedReason: null,
        blockedExpectedUnblockAt: null,
        isBlockResolved: false,
        progress: 10,
        effort: null,
        priority: Priority.MEDIUM,
        metadata: null,
        statusMetadata: null,
        path: '/node-1/task-1',
        depth: 1,
        teamId: 'team-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        archivedAt: null,
      },
      {
        id: 'task-2',
        columnId: 'col-1',
        column: {
          boardId: 'board-1',
          behavior: { key: ColumnBehaviorKey.BACKLOG },
          name: 'Backlog',
        },
        parentId: 'node-1',
        title: 'Task 2',
        description: 'Desc 2',
        dueAt: null,
        startAt: null,
        blockedSince: null,
        blockedReason: null,
        blockedExpectedUnblockAt: null,
        isBlockResolved: false,
        progress: 0,
        effort: null,
        priority: Priority.LOW,
        metadata: null,
        statusMetadata: null,
        path: '/node-1/task-2',
        depth: 1,
        teamId: 'team-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        archivedAt: null,
      },
    ]);
    prisma.boardDailySnapshot.findMany.mockResolvedValue([]);
    prisma.column.findMany.mockResolvedValue([
      {
        id: 'col-1',
        boardId: 'board-1',
        name: 'In Progress',
        position: 0,
        wipLimit: null,
        behavior: { key: ColumnBehaviorKey.IN_PROGRESS },
      },
    ]);
    userSettings.getOrDefault.mockResolvedValue({
      userId: 'user-1',
      preferences: { ...DEFAULT_DASHBOARD_PREFERENCES },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    });
  });

  it('returns computed widgets and hides those failing requirements', async () => {
    const response = await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'SELF',
    });

    expect(response.widgets).toHaveLength(1);
    expect(response.widgets[0]).toMatchObject({
      id: 'test.ok',
      status: 'ok',
      payload: { taskCount: 2 },
    });

    expect(response.hiddenWidgets).toHaveLength(2);
    const byId = Object.fromEntries(
      response.hiddenWidgets.map((widget) => [widget.id, widget]),
    );
    expect(byId['test.requirement']).toBeDefined();
    expect(byId['test.requirement']?.status).toBe('no-data');
    expect(byId['test.requirement']?.reason).toContain('Nombre minimal');
    expect(byId['test.coverage']).toBeDefined();
    expect(byId['test.coverage']?.status).toBe('insufficient-coverage');
    expect(byId['test.coverage']?.reason).toContain('Couverture insuffisante');

    expect(response.datasetRefreshedAt?.toISOString()).toBe(
      '2025-01-02T00:00:00.000Z',
    );
    expect(response.metadata.taskCount).toBe(2);
    expect(userSettings.getOrDefault).toHaveBeenCalledWith('user-1');
    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          teamId: 'team-1',
          column: { boardId: { in: ['board-1'] } },
        },
        orderBy: { id: 'asc' },
        take: 1000,
      }),
    );
    const requirementWidget = registry.find((w) => w.id === 'test.requirement');
    expect(requirementWidget?.compute).not.toHaveBeenCalled();
    const coverageWidget = registry.find((w) => w.id === 'test.coverage');
    expect(coverageWidget?.compute).not.toHaveBeenCalled();

    expect(telemetry.recordDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboard: 'EXECUTION',
        mode: 'SELF',
        widgetCount: 1,
        hiddenCount: 2,
        errorCount: 0,
      }),
    );
    expect(telemetry.recordWidget).toHaveBeenCalledWith(
      expect.objectContaining({ widgetId: 'test.ok', status: 'ok' }),
    );
    expect(telemetry.recordWidget).toHaveBeenCalledWith(
      expect.objectContaining({ widgetId: 'test.requirement', status: 'no-data' }),
    );
    expect(telemetry.recordWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        widgetId: 'test.coverage',
        status: 'insufficient-coverage',
      }),
    );
  });

  it('relaxes coverage requirements when the task sample is small', async () => {
    prisma.node.findMany.mockResolvedValueOnce([
      {
        id: 'task-1',
        columnId: 'col-1',
        column: {
          boardId: 'board-1',
          behavior: { key: ColumnBehaviorKey.IN_PROGRESS },
          name: 'In Progress',
        },
        parentId: 'node-1',
        title: 'Task 1',
        description: 'Desc 1',
        dueAt: null,
        startAt: null,
        blockedSince: null,
        blockedReason: null,
        blockedExpectedUnblockAt: null,
        isBlockResolved: false,
        progress: 10,
        effort: Effort.M,
        priority: Priority.MEDIUM,
        metadata: null,
        statusMetadata: null,
        path: '/node-1/task-1',
        depth: 1,
        teamId: 'team-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        archivedAt: null,
      },
      {
        id: 'task-2',
        columnId: 'col-1',
        column: {
          boardId: 'board-1',
          behavior: { key: ColumnBehaviorKey.BACKLOG },
          name: 'Backlog',
        },
        parentId: 'node-1',
        title: 'Task 2',
        description: 'Desc 2',
        dueAt: null,
        startAt: null,
        blockedSince: null,
        blockedReason: null,
        blockedExpectedUnblockAt: null,
        isBlockResolved: false,
        progress: 0,
        effort: null,
        priority: Priority.LOW,
        metadata: null,
        statusMetadata: null,
        path: '/node-1/task-2',
        depth: 1,
        teamId: 'team-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        archivedAt: null,
      },
    ]);

    userSettings.getOrDefault.mockResolvedValueOnce({
      userId: 'user-1',
      preferences: {
        ...DEFAULT_DASHBOARD_PREFERENCES,
        fieldCoverageThreshold: 0.6,
        fieldCoverageLowSampleThreshold: 0.3,
        fieldCoverageLowSampleTaskCount: 25,
      },
      createdAt: new Date('2025-01-01T00:00:00Z'),
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    });

    const response = await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'SELF',
    });

    const coverageEntry = response.widgets.find(
      (widget) => widget.id === 'test.coverage',
    );
    expect(coverageEntry?.status).toBe('ok');

    const coverageWidget = registry.find((w) => w.id === 'test.coverage');
    expect(coverageWidget?.compute).toHaveBeenCalled();
  });

  it('captures widget errors and reports them as hidden entries', async () => {
    const failingWidget: WidgetDefinition = {
      id: 'test.error',
      dashboard: 'EXECUTION',
      label: 'Failing',
      description: 'Throws',
      supportedModes: ['SELF'],
      dataDependencies: { tasks: false, snapshots: false },
      async compute() {
        throw new Error('boom');
      },
    };

    registry.unshift(failingWidget);

    const response = await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'SELF',
    });

    const hidden = response.hiddenWidgets.find((w) => w.id === 'test.error');
    expect(hidden).toBeDefined();
    expect(hidden?.status).toBe('no-data');
    expect(hidden?.reason).toContain('Erreur interne');

    expect(telemetry.recordWidgetError).toHaveBeenCalledWith(
      'test.error',
      expect.any(Error),
    );
    expect(telemetry.recordWidget).toHaveBeenCalledWith(
      expect.objectContaining({ widgetId: 'test.error', status: 'error' }),
    );
    expect(telemetry.recordDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ errorCount: 1 }),
    );
  });

  it('loads tasks for the board and all descendants in aggregated mode', async () => {
    prisma.board.findMany.mockResolvedValueOnce([
      {
        id: 'board-child',
        node: {
          id: 'node-child',
          title: 'Child Board',
          teamId: 'team-1',
          path: '/node-1/node-child',
          depth: 1,
          parentId: 'node-1',
        },
      },
      {
        id: 'board-grandchild',
        node: {
          id: 'node-grand',
          title: 'Grand Board',
          teamId: 'team-1',
          path: '/node-1/node-child/node-grand',
          depth: 2,
          parentId: 'node-child',
        },
      },
    ]);

    await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'AGGREGATED',
    });

    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          teamId: 'team-1',
          column: {
            boardId: {
              in: ['board-1', 'board-child', 'board-grandchild'],
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 1000,
      }),
    );
  });

  it('restricts comparison mode to direct child boards only', async () => {
    prisma.board.findMany.mockResolvedValueOnce([
      {
        id: 'board-child',
        node: {
          id: 'node-child',
          title: 'Child Board',
          teamId: 'team-1',
          path: '/node-1/node-child',
          depth: 1,
          parentId: 'node-1',
        },
      },
      {
        id: 'board-grandchild',
        node: {
          id: 'node-grand',
          title: 'Grand Board',
          teamId: 'team-1',
          path: '/node-1/node-child/node-grand',
          depth: 2,
          parentId: 'node-child',
        },
      },
    ]);

    await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'COMPARISON',
    });

    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          teamId: 'team-1',
          column: { boardId: { in: ['board-child'] } },
        },
        orderBy: { id: 'asc' },
        take: 1000,
      }),
    );
  });

  it('filters out descendants that are outside of the allowed hierarchy', async () => {
    prisma.board.findMany.mockResolvedValueOnce([
      {
        id: 'board-valid',
        node: {
          id: 'node-valid',
          title: 'Valid Child',
          teamId: 'team-1',
          path: '/node-1/node-valid',
          depth: 1,
          parentId: 'node-1',
        },
      },
      {
        id: 'board-other-team',
        node: {
          id: 'node-other',
          title: 'Other Team',
          teamId: 'team-2',
          path: '/node-1/node-other',
          depth: 1,
          parentId: 'node-1',
        },
      },
      {
        id: 'board-outside',
        node: {
          id: 'node-outside',
          title: 'Outside',
          teamId: 'team-1',
          path: '/different-root/node',
          depth: 1,
          parentId: 'different-root',
        },
      },
    ]);

    await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'AGGREGATED',
    });

    expect(prisma.node.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          teamId: 'team-1',
          column: { boardId: { in: ['board-1', 'board-valid'] } },
        },
        orderBy: { id: 'asc' },
        take: 1000,
      }),
    );
  });

  it('throws when user is not a member of the requested team', async () => {
    prisma.membership.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getDashboard({
        userId: 'user-1',
        teamId: 'team-1',
        boardId: 'board-1',
        dashboard: 'EXECUTION',
        mode: 'SELF',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('removes financial metadata before exposing tasks to widgets', async () => {
    let capturedTasks: DashboardTask[] = [];
    registry[0].compute = jest.fn(async (ctx) => {
      capturedTasks = ctx.tasks;
      return { status: 'ok' };
    });

    prisma.node.findMany.mockResolvedValueOnce([
      {
        id: 'task-secure',
        columnId: 'col-1',
        column: {
          boardId: 'board-1',
          behavior: { key: ColumnBehaviorKey.IN_PROGRESS },
          name: 'In Progress',
        },
        parentId: 'node-1',
        title: 'Secure task',
        description: 'Desc secure',
        dueAt: null,
        startAt: null,
        blockedSince: null,
        blockedReason: null,
        blockedExpectedUnblockAt: null,
        isBlockResolved: false,
        progress: 20,
        effort: null,
        priority: Priority.MEDIUM,
        metadata: {
          financials: { plannedBudget: 1000 },
          notes: 'keep me',
        },
        statusMetadata: null,
        path: '/node-1/task-secure',
        depth: 1,
        teamId: 'team-1',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-02T00:00:00Z'),
        archivedAt: null,
      },
    ]);

    await service.getDashboard({
      userId: 'user-1',
      teamId: 'team-1',
      boardId: 'board-1',
      dashboard: 'EXECUTION',
      mode: 'SELF',
    });

    expect(capturedTasks).toHaveLength(1);
    expect(capturedTasks[0].metadata).toEqual({ notes: 'keep me' });
    expect(capturedTasks[0].metadata).not.toHaveProperty('financials');
  });
});
