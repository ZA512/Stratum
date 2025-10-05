import { ColumnBehaviorKey, Effort, Priority } from '@prisma/client';
import { DEFAULT_DASHBOARD_PREFERENCES } from '../user-settings/user-settings.types';
import { DEFAULT_WIDGET_REGISTRY } from './dashboards.registry';
import {
  BoardContext,
  DashboardSnapshot,
  DashboardTask,
  DashboardMode,
  DashboardKind,
  WidgetContext,
} from './dashboards.types';

describe('Dashboards widget calculations', () => {
  const board: BoardContext = {
    id: 'board-1',
    nodeId: 'node-1',
    title: 'Board',
    teamId: 'team-1',
    path: '/node-1',
    depth: 0,
    parentId: null,
  };

  it('expose tous les widgets phase 1 dans le registre', () => {
    const ids = DEFAULT_WIDGET_REGISTRY.map((definition) => definition.id).sort();
    expect(ids).toEqual(
      [
        'exec.activity24h',
        'exec.blocked',
        'exec.needInput',
        'exec.priorities',
        'exec.upcomingDue',
        'exec.wipColumns',
        'progress.burnup',
        'progress.criticalAging',
        'progress.effortWeighted',
        'progress.forecast',
        'progress.overdue',
        'progress.percent',
        'progress.throughput',
        'risk.agingWip',
        'risk.blockedPersistent',
        'risk.concentration',
        'risk.dataQuality',
        'risk.flowAnomaly',
        'risk.healthScore',
        'risk.overdueDistribution',
      ].sort(),
    );
  });

  function findWidget(id: string) {
    const widget = DEFAULT_WIDGET_REGISTRY.find((definition) => definition.id === id);
    if (!widget) {
      throw new Error(`Widget ${id} not found in registry`);
    }
    return widget;
  }

  function createTask(overrides: Partial<DashboardTask> = {}): DashboardTask {
    return {
      id: overrides.id ?? `task-${Math.random()}`,
      boardId: overrides.boardId ?? board.id,
      columnId: overrides.columnId ?? 'column-1',
      columnBehaviorKey:
        overrides.columnBehaviorKey ?? ColumnBehaviorKey.IN_PROGRESS,
      columnName: overrides.columnName ?? 'In Progress',
      parentId: overrides.parentId ?? board.nodeId,
      title: overrides.title ?? 'Task',
      description: overrides.description ?? 'Description',
      dueAt: overrides.dueAt ?? null,
      startAt: overrides.startAt ?? new Date('2025-01-01T00:00:00Z'),
      blockedSince: overrides.blockedSince ?? null,
      blockedReason: overrides.blockedReason ?? null,
      blockedExpectedUnblockAt: overrides.blockedExpectedUnblockAt ?? null,
      isBlockResolved: overrides.isBlockResolved ?? false,
      progress: overrides.progress ?? 0,
      effort: overrides.effort ?? null,
      priority: overrides.priority ?? Priority.MEDIUM,
      metadata: overrides.metadata ?? null,
      statusMetadata: overrides.statusMetadata ?? null,
      path: overrides.path ?? '/node-1/task',
      depth: overrides.depth ?? 1,
      teamId: overrides.teamId ?? board.teamId,
      createdAt: overrides.createdAt ?? new Date('2025-01-01T00:00:00Z'),
      updatedAt: overrides.updatedAt ?? new Date('2025-01-02T00:00:00Z'),
      archivedAt: overrides.archivedAt ?? null,
    };
  }

  function createSnapshot(
    date: string,
    overrides: Partial<DashboardSnapshot> = {},
  ): DashboardSnapshot {
    return {
      id: `${overrides.boardId ?? board.id}-${date}`,
      boardId: overrides.boardId ?? board.id,
      dateUTC: new Date(date),
      backlog: overrides.backlog ?? 0,
      inProgress: overrides.inProgress ?? 0,
      blocked: overrides.blocked ?? 0,
      done: overrides.done ?? 0,
      total: overrides.total ?? overrides.done ?? 0,
    };
  }

  function createContext(options: {
    dashboard?: DashboardKind;
    mode?: DashboardMode;
    tasks?: DashboardTask[];
    snapshots?: DashboardSnapshot[];
    now?: Date;
  } = {}): WidgetContext {
    const tasks = options.tasks ?? [];
    const snapshots = options.snapshots ?? [];
    const now = options.now ?? new Date('2025-01-10T00:00:00Z');

    return {
      request: {
        userId: 'user-1',
        teamId: board.teamId,
        boardId: board.id,
        dashboard: options.dashboard ?? 'PROGRESS',
        mode: options.mode ?? 'SELF',
      },
      board,
      hierarchy: {
        self: board,
        aggregated: [],
        comparison: [],
      },
      tasks,
      snapshots,
      columns: [],
      preferences: { ...DEFAULT_DASHBOARD_PREFERENCES },
      now,
      metrics: {
        fieldCoverage: (field: string) => {
          if (!tasks.length) {
            return 0;
          }
          let filled = 0;
          for (const task of tasks) {
            const value = (task as Record<string, unknown>)[field];
            if (value === null || value === undefined) {
              continue;
            }
            if (typeof value === 'string') {
              if (value.trim().length === 0) {
                continue;
              }
            }
            filled += 1;
          }
          return filled / tasks.length;
        },
        tasksForBoard: (boardId: string) =>
          tasks.filter((task) => task.boardId === boardId),
        columnForId: () => undefined,
      },
    };
  }

  it('computes throughput averages over 7 and 14 jours', async () => {
    const widget = findWidget('progress.throughput');
    const snapshots: DashboardSnapshot[] = [];
    for (let day = 0; day <= 15; day += 1) {
      const done = day;
      snapshots.push(
        createSnapshot(`2025-01-${String(day + 1).padStart(2, '0')}T00:00:00Z`, {
          done,
          total: 30,
          backlog: 30 - done,
        }),
      );
    }

    const context = createContext({ snapshots });
    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      series: Array<{ date: string; throughput: number; rolling7Day: number }>;
      average7Day: number;
      average14Day: number;
    };
    expect(payload.series).toHaveLength(14);
    expect(payload.series[0]).toHaveProperty('rolling7Day');
    expect(payload.average7Day).toBeCloseTo(1);
    expect(payload.average14Day).toBeCloseTo(1);
    expect(payload.series[payload.series.length - 1].rolling7Day).toBeCloseTo(1);
  });

  it('derives forecast using 7 derniers jours et confiance', async () => {
    const widget = findWidget('progress.forecast');
    const totals = [
      30, 30, 30, 30, 30, 30, 30, 30, 31, 32,
    ];
    const doneValues = [
      0, 1, 3, 4, 6, 6, 8, 11, 13, 14,
    ];
    const snapshots = doneValues.map((done, index) =>
      createSnapshot(`2025-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`, {
        done,
        total: totals[index],
        backlog: Math.max(totals[index] - done, 0),
      }),
    );

    const context = createContext({ snapshots, now: new Date('2025-01-10T00:00:00Z') });
    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      meanThroughput: number;
      etaDays: number;
      remaining: number;
      confidence: string;
      sampleDays: number;
      positiveDays: number;
    };

    expect(payload.sampleDays).toBe(7);
    expect(payload.positiveDays).toBe(6);
    expect(payload.meanThroughput).toBeCloseTo(11 / 7, 5);
    expect(payload.etaDays).toBeGreaterThan(0);
    expect(payload.remaining).toBe(18);
    expect(payload.confidence).toBe('medium');
  });

  it('identifie les tâches stagnantes via dernier mouvement', async () => {
    const widget = findWidget('progress.criticalAging');
    const now = new Date('2025-01-10T00:00:00Z');
    const recentMovement = createTask({
      id: 'task-recent',
      updatedAt: new Date('2025-01-09T00:00:00Z'),
      startAt: new Date('2024-12-30T00:00:00Z'),
    });
    const staleMovement = createTask({
      id: 'task-stale',
      updatedAt: new Date('2025-01-03T00:00:00Z'),
      startAt: new Date('2024-12-25T00:00:00Z'),
    });

    const context = createContext({
      dashboard: 'PROGRESS',
      tasks: [recentMovement, staleMovement],
      now,
    });

    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      items: Array<{ id: string; stagnationDays: number }>;
    };
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].id).toBe('task-stale');
    expect(payload.items[0].stagnationDays).toBeGreaterThanOrEqual(
      context.preferences.staleInProgressDays,
    );
  });

  it('détecte une anomalie de flux lorsque throughput chute et backlog augmente', async () => {
    const widget = findWidget('risk.flowAnomaly');
    const snapshots: DashboardSnapshot[] = [];
    const doneValues = [
      0, 3, 6, 9, 12, 15, 18, 21, 21, 21, 22, 22, 22, 22, 22,
    ];
    const totals = [
      40, 40, 40, 40, 40, 40, 40, 40, 41, 42, 43, 44, 45, 46, 47,
    ];

    for (let index = 0; index < doneValues.length; index += 1) {
      const done = doneValues[index];
      const total = totals[index];
      snapshots.push(
        createSnapshot(`2025-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`, {
          done,
          total,
          backlog: Math.max(total - done, 0),
        }),
      );
    }

    const context = createContext({
      dashboard: 'RISK',
      snapshots,
    });

    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      anomaly: boolean;
      signals: Array<{ type: string }>;
      latestThroughput: number;
    };
    expect(payload.anomaly).toBe(true);
    const signalTypes = payload.signals.map((signal) => signal.type);
    expect(signalTypes).toEqual(
      expect.arrayContaining([
        'throughput-drop',
        'stalled',
        'backlog-growing',
      ]),
    );
    expect(payload.latestThroughput).toBe(0);
  });

  it('calcule les ratios de qualité de données manquantes', async () => {
    const widget = findWidget('risk.dataQuality');
    const tasks = [
      createTask({
        id: 'task-1',
        dueAt: new Date('2025-01-15T00:00:00Z'),
        effort: Effort.M,
        description: 'Description',
      }),
      createTask({
        id: 'task-2',
        dueAt: null,
        effort: null,
        description: '   ',
      }),
      createTask({
        id: 'task-3',
        dueAt: null,
        effort: null,
        description: 'Specs',
      }),
    ];

    const context = createContext({ dashboard: 'RISK', tasks });
    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      missingDueAtRatio: number;
      missingEffortRatio: number;
      missingDescriptionRatio: number;
      qualityScore: number;
    };

    expect(payload.missingDueAtRatio).toBeCloseTo(2 / 3);
    expect(payload.missingEffortRatio).toBeCloseTo(2 / 3);
    expect(payload.missingDescriptionRatio).toBeCloseTo(1 / 3);
    expect(payload.qualityScore).toBeGreaterThan(0);
  });

  it('priorise les tâches critiques avec raisons explicites', async () => {
    const widget = findWidget('exec.priorities');
    const now = new Date('2025-01-10T08:00:00Z');
    const tasks = [
      createTask({
        id: 'urgent-overdue',
        title: 'Urgent en retard',
        priority: Priority.HIGH,
        dueAt: new Date('2025-01-09T00:00:00Z'),
        columnBehaviorKey: ColumnBehaviorKey.IN_PROGRESS,
        createdAt: new Date('2025-01-05T00:00:00Z'),
      }),
      createTask({
        id: 'blocked-new',
        title: 'Bloquée récente',
        blockedSince: new Date('2025-01-09T08:00:00Z'),
        columnBehaviorKey: ColumnBehaviorKey.BLOCKED,
        createdAt: new Date('2025-01-10T04:00:00Z'),
      }),
      createTask({
        id: 'low-priority',
        title: 'Faible priorité',
        priority: Priority.LOW,
        columnBehaviorKey: ColumnBehaviorKey.BACKLOG,
      }),
    ];

    const context = createContext({
      dashboard: 'EXECUTION',
      tasks,
      now,
    });

    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      items: Array<{ id: string; reasons: string[] }>;
      totalCandidates: number;
    };

    expect(payload.totalCandidates).toBe(3);
    expect(payload.items[0]?.id).toBe('urgent-overdue');
    expect(payload.items[0]?.reasons).toEqual(
      expect.arrayContaining(['Échéance dépassée']),
    );
    expect(payload.items[1]?.id).toBe('blocked-new');
    expect(payload.items[1]?.reasons).toEqual(
      expect.arrayContaining(['Bloquée', 'Nouvelle tâche (<24h)']),
    );
  });

  it('retourne no-data quand aucune tâche active à prioriser', async () => {
    const widget = findWidget('exec.priorities');
    const result = await widget.compute(
      createContext({ dashboard: 'EXECUTION', tasks: [] }),
    );

    expect(result.status).toBe('no-data');
    expect(result.reason).toContain('Aucune tâche active');
  });

  it('signale une projection à faible confiance avec throughput limité', async () => {
    const widget = findWidget('progress.forecast');
    const snapshots = [
      createSnapshot('2025-01-01T00:00:00Z', { done: 0, total: 12 }),
      createSnapshot('2025-01-02T00:00:00Z', { done: 0, total: 12 }),
      createSnapshot('2025-01-03T00:00:00Z', { done: 1, total: 12 }),
      createSnapshot('2025-01-04T00:00:00Z', { done: 1, total: 12 }),
      createSnapshot('2025-01-05T00:00:00Z', { done: 2, total: 12 }),
      createSnapshot('2025-01-06T00:00:00Z', { done: 3, total: 12 }),
      createSnapshot('2025-01-07T00:00:00Z', { done: 3, total: 12 }),
      createSnapshot('2025-01-08T00:00:00Z', { done: 4, total: 12 }),
    ];

    const context = createContext({
      dashboard: 'PROGRESS',
      snapshots,
      now: new Date('2025-01-08T12:00:00Z'),
    });
    const result = await widget.compute(context);

    expect(result.status).toBe('ok');
    const payload = result.payload as { confidence: string; sampleDays: number };
    expect(payload.sampleDays).toBe(7);
    expect(payload.confidence).toBe('low');
  });

  it('calcule un health score cohérent avec les ratios attendus', async () => {
    const widget = findWidget('risk.healthScore');
    const now = new Date('2025-01-10T00:00:00Z');
    const tasks = [
      createTask({
        id: 'done-task',
        columnBehaviorKey: ColumnBehaviorKey.DONE,
        dueAt: new Date('2025-01-05T00:00:00Z'),
        startAt: new Date('2024-12-28T00:00:00Z'),
        createdAt: new Date('2024-12-20T00:00:00Z'),
      }),
      createTask({
        id: 'overdue-in-progress',
        columnBehaviorKey: ColumnBehaviorKey.IN_PROGRESS,
        dueAt: new Date('2025-01-08T00:00:00Z'),
        startAt: new Date('2024-12-30T00:00:00Z'),
        createdAt: new Date('2024-12-25T00:00:00Z'),
      }),
      createTask({
        id: 'blocked-stale',
        columnBehaviorKey: ColumnBehaviorKey.BLOCKED,
        blockedSince: new Date('2025-01-06T00:00:00Z'),
        startAt: new Date('2024-12-29T00:00:00Z'),
        createdAt: new Date('2024-12-28T00:00:00Z'),
      }),
      createTask({
        id: 'fresh-in-progress',
        columnBehaviorKey: ColumnBehaviorKey.IN_PROGRESS,
        startAt: new Date('2025-01-09T00:00:00Z'),
        createdAt: new Date('2025-01-09T00:00:00Z'),
      }),
      createTask({
        id: 'backlog-item',
        columnBehaviorKey: ColumnBehaviorKey.BACKLOG,
      }),
    ];

    const context = createContext({
      dashboard: 'RISK',
      tasks,
      now,
    });

    const result = await widget.compute(context);
    expect(result.status).toBe('ok');
    const payload = result.payload as {
      score: number;
      breakdown: Record<string, { ratio: number; weight: number; count: number }>;
      totals: { total: number; withDue: number; inProgress: number };
    };

    expect(payload.totals.total).toBe(5);
    expect(payload.totals.withDue).toBe(2);
    expect(payload.totals.inProgress).toBe(3);
    expect(payload.breakdown.overdue.count).toBe(1);
    expect(payload.breakdown.blocked.count).toBe(1);
    expect(payload.breakdown.stale.count).toBe(2);
    expect(payload.breakdown.missingDue.count).toBe(3);
    expect(payload.score).toBe(61);
  });
});
