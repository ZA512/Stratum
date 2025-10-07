/* eslint-disable @typescript-eslint/require-await */
import { ColumnBehaviorKey, Effort, Priority } from '@prisma/client';
import {
  DashboardColumn,
  DashboardSnapshot,
  DashboardTask,
  WidgetContext,
  WidgetDefinition,
} from './dashboards.types';

const MS_IN_HOUR = 3_600_000;
const MS_IN_DAY = 86_400_000;

type SnapshotAggregate = {
  date: string;
  backlog: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
};

function boardIdsForContext(ctx: WidgetContext): string[] {
  switch (ctx.request.mode) {
    case 'SELF':
      return [ctx.board.id];
    case 'AGGREGATED':
      return ctx.hierarchy.aggregated.map((board) => board.id);
    case 'COMPARISON':
      return ctx.hierarchy.comparison.map((board) => board.id);
    default:
      return [ctx.board.id];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function isDone(task: DashboardTask): boolean {
  return task.columnBehaviorKey === ColumnBehaviorKey.DONE;
}

function isInProgress(task: DashboardTask): boolean {
  return (
    task.columnBehaviorKey === ColumnBehaviorKey.IN_PROGRESS ||
    task.columnBehaviorKey === ColumnBehaviorKey.BLOCKED
  );
}

function isBacklog(task: DashboardTask): boolean {
  return task.columnBehaviorKey === ColumnBehaviorKey.BACKLOG;
}

function resolveStartDate(task: DashboardTask): Date {
  const meta = asRecord(task.statusMetadata);
  const startedAt =
    task.startAt ??
    toDate(meta?.['startedAt']) ??
    toDate(meta?.['firstStartedAt']);
  return startedAt ?? task.createdAt;
}

function resolveLastActivity(task: DashboardTask): Date | null {
  const meta = asRecord(task.statusMetadata);
  const transition = toDate(meta?.['lastTransitionAt']);
  const movement = toDate(meta?.['movedAt']);
  const timestamps = [task.updatedAt, transition, movement].filter(
    (value): value is Date => value instanceof Date,
  );
  if (!timestamps.length) {
    return null;
  }
  timestamps.sort((a, b) => b.getTime() - a.getTime());
  return timestamps[0];
}

function resolveBlockedSince(task: DashboardTask): Date | null {
  if (task.isBlockResolved) {
    return null;
  }
  const meta = asRecord(task.statusMetadata);
  return task.blockedSince ?? toDate(meta?.['blockedSince']) ?? null;
}

function differenceInHours(from: Date, to: Date): number {
  return (from.getTime() - to.getTime()) / MS_IN_HOUR;
}

function differenceInDays(from: Date, to: Date): number {
  return (from.getTime() - to.getTime()) / MS_IN_DAY;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function priorityWeight(priority: Priority): number {
  switch (priority) {
    case Priority.CRITICAL:
      return 5;
    case Priority.HIGH:
      return 4;
    case Priority.MEDIUM:
      return 3;
    case Priority.LOW:
      return 2;
    case Priority.LOWEST:
    case Priority.NONE:
    default:
      return 1;
  }
}

const EFFORT_WEIGHTS: Record<Effort, number> = {
  UNDER2MIN: 0.5,
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8,
  XXL: 13,
};

function effortWeight(effort: Effort | null): number | null {
  if (!effort) {
    return null;
  }
  return EFFORT_WEIGHTS[effort] ?? null;
}

function aggregateSnapshots(
  snapshots: DashboardSnapshot[],
  boardIds: string[],
): SnapshotAggregate[] {
  if (!snapshots.length || !boardIds.length) {
    return [];
  }

  const allowed = new Set(boardIds);
  const aggregates = new Map<string, SnapshotAggregate>();

  for (const snapshot of snapshots) {
    if (!allowed.has(snapshot.boardId)) {
      continue;
    }
    const key = snapshot.dateUTC.toISOString().slice(0, 10);
    const current = aggregates.get(key);
    if (!current) {
      aggregates.set(key, {
        date: key,
        backlog: snapshot.backlog,
        inProgress: snapshot.inProgress,
        blocked: snapshot.blocked,
        done: snapshot.done,
        total: snapshot.total,
      });
    } else {
      current.backlog += snapshot.backlog;
      current.inProgress += snapshot.inProgress;
      current.blocked += snapshot.blocked;
      current.done += snapshot.done;
      current.total += snapshot.total;
    }
  }

  return Array.from(aggregates.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function resolveColumnMap(
  columns: DashboardColumn[],
): Map<string, DashboardColumn> {
  const map = new Map<string, DashboardColumn>();
  for (const column of columns) {
    map.set(column.id, column);
  }
  return map;
}

function executionPriorities(): WidgetDefinition {
  return {
    id: 'exec.priorities',
    dashboard: 'EXECUTION',
    label: 'Priorités immédiates',
    description: 'Mise en avant des tâches critiques à traiter rapidement',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const windowDays = ctx.preferences.upcomingDueDays;
      const windowMs = windowDays * MS_IN_DAY;
      const candidates = ctx.tasks.filter((task) => !isDone(task));

      if (!candidates.length) {
        return {
          status: 'no-data',
          reason: 'Aucune tâche active à prioriser',
        };
      }

      const items = candidates
        .map((task) => {
          const reasons: string[] = [];
          let score = priorityWeight(task.priority) * 10;

          if (task.dueAt) {
            const dueDiffMs = task.dueAt.getTime() - now.getTime();
            const absDiffDays = dueDiffMs / MS_IN_DAY;
            if (dueDiffMs <= 0) {
              score += 120;
              reasons.push('Échéance dépassée');
            } else if (dueDiffMs <= windowMs) {
              const urgency = clamp(100 - (dueDiffMs / windowMs) * 80, 20, 100);
              score += urgency;
              reasons.push(`Échéance dans ${absDiffDays.toFixed(1)}j`);
            }
          }

          const blockedSince = resolveBlockedSince(task);
          if (blockedSince) {
            const blockedHours = differenceInHours(now, blockedSince);
            score += 80 + Math.min(blockedHours, 48);
            reasons.push('Bloquée');
          }

          if (isInProgress(task)) {
            score += 20;
          }

          const ageHours = differenceInHours(now, task.createdAt);
          if (ageHours <= 24) {
            score += 15;
            reasons.push('Nouvelle tâche (<24h)');
          }

          if (task.progress < 50 && !isBacklog(task)) {
            score += 10;
            reasons.push('Progression faible');
          }

          return {
            id: task.id,
            boardId: task.boardId,
            title: task.title,
            columnBehaviorKey: task.columnBehaviorKey,
            columnName: task.columnName,
            priority: task.priority,
            dueAt: task.dueAt,
            createdAt: task.createdAt,
            blockedSince,
            score,
            reasons,
          };
        })
        .sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return aDue - bDue;
        })
        .slice(0, 12);

      return {
        status: 'ok',
        payload: {
          totalCandidates: candidates.length,
          items,
        },
        meta: {
          windowDays,
        },
      };
    },
  };
}

function executionBlocked(): WidgetDefinition {
  return {
    id: 'exec.blocked',
    dashboard: 'EXECUTION',
    label: 'Blocages actifs',
    description: 'Cartes marquées comme bloquées et nécessitant une action',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const highlightDays = ctx.preferences.blockedAgingHighlightDays;
      const highlightHours = highlightDays * 24;
      const blockedTasks = ctx.tasks
        .filter((task) => resolveBlockedSince(task))
        .map((task) => {
          const blockedSince = resolveBlockedSince(task)!;
          const durationHours = differenceInHours(now, blockedSince);
          return {
            id: task.id,
            boardId: task.boardId,
            title: task.title,
            columnBehaviorKey: task.columnBehaviorKey,
            columnName: task.columnName,
            blockedSince,
            durationHours,
            blockedReason: task.blockedReason,
            expectedUnblockAt: task.blockedExpectedUnblockAt,
            highlight: durationHours >= highlightHours,
          };
        })
        .sort((a, b) => b.durationHours - a.durationHours);

      if (!blockedTasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucun blocage actif détecté',
        };
      }

      return {
        status: 'ok',
        payload: {
          count: blockedTasks.length,
          highlightThresholdHours: highlightHours,
          tasks: blockedTasks,
        },
      };
    },
  };
}

function executionUpcomingDue(): WidgetDefinition {
  return {
    id: 'exec.upcomingDue',
    dashboard: 'EXECUTION',
    label: 'Échéances proches',
    description: "Tâches dont l'échéance approche dans la fenêtre configurée",
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const windowDays = ctx.preferences.upcomingDueDays;
      const windowMs = windowDays * MS_IN_DAY;
      const groups = new Map<
        string,
        { label: string; tasks: any[]; order: number }
      >();

      for (const task of ctx.tasks) {
        if (!task.dueAt || isDone(task)) {
          continue;
        }
        const diffMs = task.dueAt.getTime() - now.getTime();
        if (diffMs > windowMs && diffMs >= 0) {
          continue;
        }
        const diffDays = Math.floor(diffMs / MS_IN_DAY);
        let key: string;
        let label: string;
        let order: number;
        if (diffMs < 0) {
          key = 'overdue';
          label = 'En retard';
          order = -1000;
        } else if (diffDays === 0) {
          key = 'today';
          label = "Aujourd'hui";
          order = 0;
        } else {
          key = `in-${diffDays}`;
          label = diffDays === 1 ? 'Dans 1 jour' : `Dans ${diffDays} jours`;
          order = diffDays;
        }

        const entry = groups.get(key);
        const payload = {
          id: task.id,
          boardId: task.boardId,
          title: task.title,
          columnBehaviorKey: task.columnBehaviorKey,
          columnName: task.columnName,
          dueAt: task.dueAt,
          remainingDays: diffMs / MS_IN_DAY,
          priority: task.priority,
        };
        if (entry) {
          entry.tasks.push(payload);
        } else {
          groups.set(key, { label, tasks: [payload], order });
        }
      }

      if (!groups.size) {
        return {
          status: 'no-data',
          reason: 'Aucune échéance imminente',
        };
      }

      const buckets = Array.from(groups.entries())
        .sort((a, b) => a[1].order - b[1].order)
        .map(([key, value]) => ({
          key,
          label: value.label,
          tasks: value.tasks,
        }));

      return {
        status: 'ok',
        payload: {
          windowDays,
          buckets,
        },
      };
    },
  };
}

function executionWipColumns(): WidgetDefinition {
  return {
    id: 'exec.wipColumns',
    dashboard: 'EXECUTION',
    label: 'Charge par colonne',
    description: 'Distribution du WIP par colonne vs limites définies',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true, columns: true },
    async compute(ctx) {
      const boardIds = boardIdsForContext(ctx);
      const columnMap = resolveColumnMap(
        ctx.columns.filter((column) => boardIds.includes(column.boardId)),
      );

      if (!columnMap.size) {
        return {
          status: 'no-data',
          reason: 'Aucune colonne détectée pour le périmètre',
        };
      }

      if (ctx.request.mode === 'SELF') {
        const orderedColumns = Array.from(columnMap.values())
          .filter((column) => column.boardId === ctx.board.id)
          .sort((a, b) => a.position - b.position);

        const items = orderedColumns.map((column) => {
          const count = ctx.tasks.filter(
            (task) => task.columnId === column.id,
          ).length;
          const limit = column.wipLimit ?? null;
          const saturation = limit ? count / limit : null;
          return {
            id: column.id,
            name: column.name,
            behaviorKey: column.behaviorKey,
            count,
            wipLimit: limit,
            saturation,
            overLimit: saturation !== null && saturation > 1,
            approachingLimit:
              saturation !== null && saturation >= 0.8 && saturation <= 1,
          };
        });

        return {
          status: 'ok',
          payload: {
            mode: 'SELF',
            items,
          },
        };
      }

      // AGGREGATED
      const grouped = new Map<
        ColumnBehaviorKey,
        { count: number; columns: number }
      >();
      for (const column of columnMap.values()) {
        const current = grouped.get(column.behaviorKey) ?? {
          count: 0,
          columns: 0,
        };
        const count = ctx.tasks.filter(
          (task) => task.columnId === column.id,
        ).length;
        current.count += count;
        current.columns += 1;
        grouped.set(column.behaviorKey, current);
      }

      const behaviorOrder: ColumnBehaviorKey[] = [
        ColumnBehaviorKey.BACKLOG,
        ColumnBehaviorKey.IN_PROGRESS,
        ColumnBehaviorKey.BLOCKED,
        ColumnBehaviorKey.DONE,
        ColumnBehaviorKey.CUSTOM,
      ];

      const items = behaviorOrder
        .filter((behavior) => grouped.has(behavior))
        .map((behavior) => {
          const entry = grouped.get(behavior)!;
          return {
            behaviorKey: behavior,
            count: entry.count,
            averagePerBoard: entry.count / entry.columns,
          };
        });

      return {
        status: 'ok',
        payload: {
          mode: ctx.request.mode,
          items,
        },
      };
    },
  };
}

function executionActivity24h(): WidgetDefinition {
  return {
    id: 'exec.activity24h',
    dashboard: 'EXECUTION',
    label: 'Activité 24h',
    description: 'Flux des mouvements sur les 24 dernières heures',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const windowStart = new Date(now.getTime() - 24 * MS_IN_HOUR);
      const bucketSizeHours = 4;
      const bucketCount = 24 / bucketSizeHours;
      const buckets = Array.from({ length: bucketCount }, (_, index) => ({
        key: index,
        from: new Date(
          windowStart.getTime() + index * bucketSizeHours * MS_IN_HOUR,
        ),
        to: new Date(
          windowStart.getTime() + (index + 1) * bucketSizeHours * MS_IN_HOUR,
        ),
        count: 0,
      }));

      for (const task of ctx.tasks) {
        const lastActivity = resolveLastActivity(task);
        if (!lastActivity) {
          continue;
        }
        if (lastActivity < windowStart || lastActivity > now) {
          continue;
        }
        const diffHours = differenceInHours(lastActivity, windowStart);
        const bucketIndex = Math.min(
          buckets.length - 1,
          Math.max(0, Math.floor(diffHours / bucketSizeHours)),
        );
        buckets[bucketIndex].count += 1;
      }

      const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
      if (!total) {
        return {
          status: 'no-data',
          reason: 'Aucune activité détectée sur les 24 dernières heures',
        };
      }

      const payloadBuckets = buckets.map((bucket) => ({
        label: `${bucket.from.toISOString().slice(11, 16)}-${bucket.to
          .toISOString()
          .slice(11, 16)}`,
        count: bucket.count,
      }));

      return {
        status: 'ok',
        payload: {
          total,
          buckets: payloadBuckets,
        },
      };
    },
  };
}

function executionNeedInput(): WidgetDefinition {
  return {
    id: 'exec.needInput',
    dashboard: 'EXECUTION',
    label: 'Besoin d’input',
    description: 'Cartes nécessitant des compléments ou arbitrages',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const windowDays = ctx.preferences.upcomingDueDays;
      const windowMs = windowDays * MS_IN_DAY;
      const needsInput = ctx.tasks
        .filter((task) => !isDone(task))
        .filter((task) => {
          const missingDescription =
            !task.description || !task.description.trim();
          const dueSoon =
            task.dueAt && task.dueAt.getTime() - now.getTime() <= windowMs;
          const overdue = task.dueAt && task.dueAt < now;
          const lowProgress = task.progress < 25;
          return (
            missingDescription ||
            ((dueSoon || overdue) && lowProgress) ||
            (task.priority === Priority.CRITICAL && lowProgress)
          );
        })
        .map((task) => ({
          id: task.id,
          boardId: task.boardId,
          title: task.title,
          columnBehaviorKey: task.columnBehaviorKey,
          columnName: task.columnName,
          dueAt: task.dueAt,
          priority: task.priority,
          missingDescription: !task.description || !task.description.trim(),
          lowProgress: task.progress < 25,
        }));

      if (!needsInput.length) {
        return {
          status: 'no-data',
          reason: 'Aucune carte ne nécessite de complément d’information',
        };
      }

      return {
        status: 'ok',
        payload: {
          count: needsInput.length,
          items: needsInput,
        },
      };
    },
  };
}

function progressPercent(): WidgetDefinition {
  return {
    id: 'progress.percent',
    dashboard: 'PROGRESS',
    label: 'Progression %',
    description: 'Ratio de progression du board et de ses sous-kanbans',
    supportedModes: ['SELF', 'AGGREGATED', 'COMPARISON'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const totalTasks = ctx.tasks.length;
      if (!totalTasks) {
        return {
          status: 'no-data',
          reason: 'Aucune tâche disponible pour calculer la progression',
        };
      }

      const doneTasks = ctx.tasks.filter((task) => isDone(task)).length;
      const percent = (doneTasks / totalTasks) * 100;

      const perBoard = boardIdsForContext(ctx).map((boardId) => {
        const tasks = ctx.metrics.tasksForBoard(boardId);
        const total = tasks.length;
        const done = tasks.filter((task) => isDone(task)).length;
        return {
          boardId,
          total,
          done,
          percent: total ? (done / total) * 100 : 0,
        };
      });

      return {
        status: 'ok',
        payload: {
          total: totalTasks,
          done: doneTasks,
          percent,
          perBoard,
        },
      };
    },
  };
}

function progressBurnup(): WidgetDefinition {
  return {
    id: 'progress.burnup',
    dashboard: 'PROGRESS',
    label: 'Burnup',
    description: 'Projection des volumes terminés vs scope total',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { snapshots: true },
    requirements: { historyDays: 3 },
    async compute(ctx) {
      const boardIds = boardIdsForContext(ctx);
      const aggregates = aggregateSnapshots(ctx.snapshots, boardIds);

      if (!aggregates.length) {
        return {
          status: 'no-data',
          reason: "Pas d'historique de snapshots disponible",
        };
      }

      const series = aggregates.map((aggregate) => ({
        date: aggregate.date,
        done: aggregate.done,
        total: aggregate.total,
      }));

      return {
        status: 'ok',
        payload: {
          series,
        },
      };
    },
  };
}

type ThroughputEntry = {
  date: string;
  throughput: number;
  rolling7Day: number;
};

function computeThroughputSeries(
  ctx: WidgetContext,
  boardIds: string[],
): ThroughputEntry[] {
  const aggregates = aggregateSnapshots(ctx.snapshots, boardIds);
  if (aggregates.length < 2) {
    return [];
  }

  const series: ThroughputEntry[] = [];
  let previous = aggregates[0];
  const rollingWindow: number[] = [];

  for (let index = 1; index < aggregates.length; index += 1) {
    const current = aggregates[index];
    const throughput = Math.max(current.done - previous.done, 0);
    rollingWindow.push(throughput);
    if (rollingWindow.length > 7) {
      rollingWindow.shift();
    }
    const rolling7Day =
      rollingWindow.reduce((sum, value) => sum + value, 0) /
      rollingWindow.length;

    series.push({ date: current.date, throughput, rolling7Day });
    previous = current;
  }
  return series;
}

function progressThroughput(): WidgetDefinition {
  return {
    id: 'progress.throughput',
    dashboard: 'PROGRESS',
    label: 'Throughput',
    description: 'Historique du throughput sur les derniers jours',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { snapshots: true },
    requirements: { historyDays: 3 },
    async compute(ctx) {
      const boardIds = boardIdsForContext(ctx);
      const series = computeThroughputSeries(ctx, boardIds);

      if (!series.length) {
        return {
          status: 'no-data',
          reason: 'Impossible de calculer le throughput sans historique',
        };
      }

      const recent = series.slice(-14);
      const last7 = recent.slice(-7);
      const average14Day =
        recent.reduce((sum, item) => sum + item.throughput, 0) / recent.length;
      const average7Day = last7.length
        ? last7.reduce((sum, item) => sum + item.throughput, 0) / last7.length
        : average14Day;

      return {
        status: 'ok',
        payload: {
          series: recent,
          average7Day,
          average14Day,
        },
      };
    },
  };
}

function progressForecast(): WidgetDefinition {
  return {
    id: 'progress.forecast',
    dashboard: 'PROGRESS',
    label: 'Projection de fin',
    description: 'Estimation d’ETA basée sur le throughput récent',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { snapshots: true },
    requirements: { historyDays: 4 },
    async compute(ctx) {
      const boardIds = boardIdsForContext(ctx);
      const aggregates = aggregateSnapshots(ctx.snapshots, boardIds);
      if (aggregates.length < 2) {
        return {
          status: 'no-data',
          reason: "Pas d'historique suffisant pour la projection",
        };
      }

      const series = computeThroughputSeries(ctx, boardIds);
      if (!series.length) {
        return {
          status: 'no-data',
          reason: 'Historique de throughput insuffisant',
        };
      }

      const window = series.slice(-7);
      const minPoints = ctx.preferences.forecastMinThroughputPoints;
      const positiveDays = window.filter((entry) => entry.throughput > 0);

      if (positiveDays.length < minPoints) {
        return {
          status: 'no-data',
          reason: `Nombre de jours terminés insuffisant (${positiveDays.length}/${minPoints})`,
        };
      }

      const meanThroughput =
        window.reduce((sum, entry) => sum + entry.throughput, 0) /
        window.length;

      if (meanThroughput <= 0) {
        return {
          status: 'no-data',
          reason: 'Throughput moyen nul, projection impossible',
        };
      }

      const variance =
        window.reduce(
          (sum, entry) => sum + (entry.throughput - meanThroughput) ** 2,
          0,
        ) / window.length;
      const stdDeviation = Math.sqrt(variance);
      const coefficientOfVariation = meanThroughput
        ? stdDeviation / meanThroughput
        : Number.POSITIVE_INFINITY;

      let confidence: 'low' | 'medium' | 'high' = 'high';
      if (coefficientOfVariation > 0.75 || positiveDays.length === minPoints) {
        confidence = 'low';
      } else if (
        coefficientOfVariation > 0.4 ||
        positiveDays.length < window.length
      ) {
        confidence = 'medium';
      }

      const latest = aggregates[aggregates.length - 1];
      const remaining = Math.max(latest.total - latest.done, 0);
      const etaDays = remaining / meanThroughput;
      const etaDate = new Date(ctx.now.getTime() + etaDays * MS_IN_DAY);

      return {
        status: 'ok',
        payload: {
          remaining,
          meanThroughput,
          etaDays,
          etaDate,
          sampleDays: window.length,
          positiveDays: positiveDays.length,
          confidence,
          latestThroughput: window[window.length - 1]?.throughput ?? 0,
          rolling7Day: window[window.length - 1]?.rolling7Day ?? meanThroughput,
        },
      };
    },
  };
}

function progressOverdue(): WidgetDefinition {
  return {
    id: 'progress.overdue',
    dashboard: 'PROGRESS',
    label: 'Tâches en retard',
    description: 'Métriques sur les tâches dépassées',
    supportedModes: ['SELF', 'AGGREGATED', 'COMPARISON'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const overdueTasks = ctx.tasks.filter(
        (task) => !isDone(task) && task.dueAt && task.dueAt < now,
      );

      if (!overdueTasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucune tâche en retard',
        };
      }

      const totalWithDue = ctx.tasks.filter((task) => task.dueAt).length;
      const ratio = totalWithDue
        ? overdueTasks.length / totalWithDue
        : overdueTasks.length / ctx.tasks.length;

      const items = overdueTasks
        .map((task) => ({
          id: task.id,
          boardId: task.boardId,
          title: task.title,
          columnBehaviorKey: task.columnBehaviorKey,
          columnName: task.columnName,
          dueAt: task.dueAt,
          overdueDays: task.dueAt ? differenceInDays(now, task.dueAt) : 0,
        }))
        .sort((a, b) => b.overdueDays - a.overdueDays);

      return {
        status: 'ok',
        payload: {
          count: overdueTasks.length,
          ratio,
          items,
        },
      };
    },
  };
}

function progressCriticalAging(): WidgetDefinition {
  return {
    id: 'progress.criticalAging',
    dashboard: 'PROGRESS',
    label: 'Stagnation critique',
    description: 'Cartes en cours dépassant le seuil de stagnation',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const thresholdDays = ctx.preferences.staleInProgressDays;
      const staleTasks = ctx.tasks
        .filter((task) => isInProgress(task))
        .map((task) => {
          const startedAt = resolveStartDate(task);
          const lastActivityAt = resolveLastActivity(task) ?? startedAt;
          const stagnationDays = differenceInDays(now, lastActivityAt);
          const agingDays = differenceInDays(now, startedAt);
          return {
            id: task.id,
            boardId: task.boardId,
            title: task.title,
            columnBehaviorKey: task.columnBehaviorKey,
            columnName: task.columnName,
            startedAt,
            lastActivityAt,
            stagnationDays,
            agingDays,
          };
        })
        .filter((item) => item.stagnationDays >= thresholdDays)
        .sort((a, b) => b.stagnationDays - a.stagnationDays);

      if (!staleTasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucune tâche stagnante au-delà du seuil',
        };
      }

      return {
        status: 'ok',
        payload: {
          thresholdDays,
          items: staleTasks,
        },
      };
    },
  };
}

function progressEffortWeighted(): WidgetDefinition {
  return {
    id: 'progress.effortWeighted',
    dashboard: 'PROGRESS',
    label: 'Progression pondérée',
    description: "Progression pondérée par l'effort déclaré",
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    requirements: {
      minCoverage: [
        {
          field: 'effort',
          ratio: 0.4,
          relaxedRatio: 0.3,
        },
      ],
      minItems: 5,
    },
    async compute(ctx) {
      const weightedTasks = ctx.tasks
        .map((task) => ({ ...task, weight: effortWeight(task.effort) }))
        .filter((task) => task.weight !== null) as Array<
        DashboardTask & {
          weight: number;
        }
      >;

      if (!weightedTasks.length) {
        return {
          status: 'no-data',
          reason:
            'Aucun effort renseigné pour calculer la progression pondérée',
        };
      }

      const totalEffort = weightedTasks.reduce(
        (sum, task) => sum + task.weight,
        0,
      );
      const doneEffort = weightedTasks
        .filter((task) => isDone(task))
        .reduce((sum, task) => sum + task.weight, 0);
      const percent = totalEffort ? (doneEffort / totalEffort) * 100 : 0;

      return {
        status: 'ok',
        payload: {
          totalEffort,
          doneEffort,
          percent,
          coverage: weightedTasks.length / ctx.tasks.length,
        },
      };
    },
  };
}

function riskHealthScore(): WidgetDefinition {
  return {
    id: 'risk.healthScore',
    dashboard: 'RISK',
    label: 'Health Score',
    description: 'Synthèse des indicateurs de santé du flux',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const tasks = ctx.tasks.filter((task) => !task.archivedAt);
      if (!tasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucune tâche pour calculer le score de santé',
        };
      }

      const total = tasks.length;
      const withDue = tasks.filter((task) => task.dueAt).length;
      const overdue = tasks.filter(
        (task) => task.dueAt && task.dueAt < now && !isDone(task),
      ).length;
      const blocked = tasks.filter((task) => resolveBlockedSince(task)).length;
      const inProgress = tasks.filter((task) => isInProgress(task)).length;
      const stale = tasks
        .filter((task) => isInProgress(task))
        .filter((task) => {
          const startedAt = resolveStartDate(task);
          return (
            differenceInDays(now, startedAt) >=
            ctx.preferences.staleInProgressDays
          );
        }).length;
      const missingDue = total - withDue;

      const R1 = withDue ? overdue / withDue : 0;
      const R2 = total ? blocked / total : 0;
      const R3 = inProgress ? stale / inProgress : 0;
      const R4 = total ? missingDue / total : 0;

      const scoreRaw = 100 - (R1 * 30 + R2 * 25 + R3 * 20 + R4 * 10);
      const score = Math.round(clamp(scoreRaw, 0, 100));

      return {
        status: 'ok',
        payload: {
          score,
          breakdown: {
            overdue: { ratio: R1, weight: 30, count: overdue },
            blocked: { ratio: R2, weight: 25, count: blocked },
            stale: { ratio: R3, weight: 20, count: stale },
            missingDue: { ratio: R4, weight: 10, count: missingDue },
          },
          totals: {
            total,
            withDue,
            inProgress,
          },
        },
      };
    },
  };
}

function riskAgingWip(): WidgetDefinition {
  return {
    id: 'risk.agingWip',
    dashboard: 'RISK',
    label: 'Aging WIP',
    description: 'Analyse du vieillissement des cartes en cours',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const minSample = ctx.preferences.agingWipMin;
      const items = ctx.tasks
        .filter((task) => isInProgress(task))
        .map((task) => {
          const startedAt = resolveStartDate(task);
          return {
            id: task.id,
            boardId: task.boardId,
            title: task.title,
            columnBehaviorKey: task.columnBehaviorKey,
            columnName: task.columnName,
            startedAt,
            agingDays: differenceInDays(now, startedAt),
          };
        })
        .sort((a, b) => b.agingDays - a.agingDays);

      if (items.length < minSample) {
        return {
          status: 'no-data',
          reason: `Échantillon insuffisant pour l’aging WIP (${items.length}/${minSample})`,
        };
      }

      const average =
        items.reduce((sum, item) => sum + item.agingDays, 0) / items.length;

      return {
        status: 'ok',
        payload: {
          count: items.length,
          average,
          items,
        },
      };
    },
  };
}

function riskBlockedPersistent(): WidgetDefinition {
  return {
    id: 'risk.blockedPersistent',
    dashboard: 'RISK',
    label: 'Blocages persistants',
    description: 'Identification des blocages prolongés',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const thresholdDays = ctx.preferences.blockedAgingHighlightDays;
      const persistent = ctx.tasks
        .filter((task) => resolveBlockedSince(task))
        .map((task) => {
          const blockedSince = resolveBlockedSince(task)!;
          const blockedDays = differenceInDays(now, blockedSince);
          return {
            id: task.id,
            boardId: task.boardId,
            title: task.title,
            columnBehaviorKey: task.columnBehaviorKey,
            columnName: task.columnName,
            blockedSince,
            blockedDays,
            blockedReason: task.blockedReason,
          };
        })
        .filter((item) => item.blockedDays >= thresholdDays)
        .sort((a, b) => b.blockedDays - a.blockedDays);

      if (!persistent.length) {
        return {
          status: 'no-data',
          reason: 'Aucun blocage prolongé au-delà du seuil',
        };
      }

      return {
        status: 'ok',
        payload: {
          thresholdDays,
          items: persistent,
        },
      };
    },
  };
}

function riskOverdueDistribution(): WidgetDefinition {
  return {
    id: 'risk.overdueDistribution',
    dashboard: 'RISK',
    label: 'Répartition des retards',
    description: 'Répartition des tâches en retard par gravité',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const now = ctx.now;
      const overdueTasks = ctx.tasks.filter(
        (task) => !isDone(task) && task.dueAt && task.dueAt < now,
      );

      if (!overdueTasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucun retard à analyser',
        };
      }

      const buckets = [
        { key: '0-2', label: '0-2 jours', min: 0, max: 2, count: 0 },
        { key: '3-5', label: '3-5 jours', min: 3, max: 5, count: 0 },
        { key: '6-10', label: '6-10 jours', min: 6, max: 10, count: 0 },
        {
          key: '10+',
          label: '10+ jours',
          min: 11,
          max: Number.POSITIVE_INFINITY,
          count: 0,
        },
      ];

      for (const task of overdueTasks) {
        const overdueDays = differenceInDays(now, task.dueAt!);
        const bucket = buckets.find(
          (item) => overdueDays >= item.min && overdueDays <= item.max,
        );
        if (bucket) {
          bucket.count += 1;
        }
      }

      return {
        status: 'ok',
        payload: {
          total: overdueTasks.length,
          buckets,
        },
      };
    },
  };
}

function riskFlowAnomaly(): WidgetDefinition {
  return {
    id: 'risk.flowAnomaly',
    dashboard: 'RISK',
    label: 'Anomalies de flux',
    description: 'Détection d’anomalies sur le flux de travail',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { snapshots: true },
    requirements: { historyDays: 4 },
    async compute(ctx) {
      const boardIds = boardIdsForContext(ctx);
      const aggregates = aggregateSnapshots(ctx.snapshots, boardIds);
      const throughputSeries = computeThroughputSeries(ctx, boardIds);

      if (aggregates.length < 3 || throughputSeries.length < 3) {
        return {
          status: 'no-data',
          reason: 'Historique insuffisant pour détecter des anomalies',
        };
      }

      const recent = throughputSeries.slice(-7);
      const previous = throughputSeries.slice(-14, -7);
      const recentAverage =
        recent.reduce((sum, entry) => sum + entry.throughput, 0) /
        recent.length;
      const previousAverage = previous.length
        ? previous.reduce((sum, entry) => sum + entry.throughput, 0) /
          previous.length
        : recentAverage;
      const latestEntry = recent[recent.length - 1];

      const recentAggregatesStartIndex = Math.max(
        0,
        aggregates.length - 1 - recent.length,
      );
      const baselineAggregate = aggregates[recentAggregatesStartIndex];
      const latestAggregate = aggregates[aggregates.length - 1];
      const baselineOutstanding = Math.max(
        baselineAggregate.total - baselineAggregate.done,
        0,
      );
      const latestOutstanding = Math.max(
        latestAggregate.total - latestAggregate.done,
        0,
      );
      const outstandingDelta = latestOutstanding - baselineOutstanding;
      const backlogGrowing =
        baselineOutstanding > 0
          ? outstandingDelta / baselineOutstanding >= 0.2
          : outstandingDelta > 2;

      const zeroStreak = recent
        .slice(-3)
        .every((entry) => entry.throughput === 0);
      const throughputDrop =
        previous.length > 0 && previousAverage > 0
          ? recentAverage < previousAverage * 0.6
          : false;

      const signals: Array<{
        type: 'throughput-drop' | 'stalled' | 'backlog-growing';
        severity: 'low' | 'medium' | 'high';
        message: string;
      }> = [];

      if (throughputDrop) {
        signals.push({
          type: 'throughput-drop',
          severity: 'medium',
          message:
            'Throughput 7j en forte baisse vs la période précédente (≥40%)',
        });
      }

      if (zeroStreak) {
        signals.push({
          type: 'stalled',
          severity: 'high',
          message: 'Aucune livraison sur les 3 derniers jours',
        });
      }

      if (backlogGrowing) {
        signals.push({
          type: 'backlog-growing',
          severity: 'medium',
          message: 'Work en attente en hausse significative',
        });
      }

      return {
        status: 'ok',
        payload: {
          anomaly: signals.length > 0,
          signals,
          recentAverage,
          previousAverage,
          latestThroughput: latestEntry.throughput,
          latestRolling7Day: latestEntry.rolling7Day,
          outstandingDelta,
          latestOutstanding,
        },
      };
    },
  };
}

function riskConcentration(): WidgetDefinition {
  return {
    id: 'risk.concentration',
    dashboard: 'RISK',
    label: 'Concentration des risques',
    description: 'Répartition des risques par zone ou responsable',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      const tasks = ctx.tasks.filter(
        (task) =>
          resolveBlockedSince(task) || (task.dueAt && task.dueAt < ctx.now),
      );

      if (!tasks.length) {
        return {
          status: 'no-data',
          reason: 'Pas de risques identifiés à analyser',
        };
      }

      if (tasks.length < ctx.preferences.minSample) {
        return {
          status: 'no-data',
          reason: `Échantillon insuffisant pour analyser la concentration (${tasks.length}/${ctx.preferences.minSample})`,
        };
      }

      const byColumn = new Map<
        string,
        { columnName: string | null; count: number }
      >();
      for (const task of tasks) {
        const key = task.columnId;
        const entry = byColumn.get(key);
        if (entry) {
          entry.count += 1;
        } else {
          byColumn.set(key, {
            columnName: task.columnName,
            count: 1,
          });
        }
      }

      const total = tasks.length;
      const items = Array.from(byColumn.entries())
        .map(([columnId, value]) => ({
          columnId,
          columnName: value.columnName,
          count: value.count,
          ratio: value.count / total,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      return {
        status: 'ok',
        payload: {
          total,
          items,
        },
      };
    },
  };
}

function riskDataQuality(): WidgetDefinition {
  return {
    id: 'risk.dataQuality',
    dashboard: 'RISK',
    label: 'Qualité des données',
    description: 'Évaluation de la qualité et complétude des données',
    supportedModes: ['SELF', 'AGGREGATED'],
    dataDependencies: { tasks: true },
    async compute(ctx) {
      if (!ctx.tasks.length) {
        return {
          status: 'no-data',
          reason: 'Aucune donnée disponible pour évaluer la qualité',
        };
      }

      const coverageDueAt = ctx.metrics.fieldCoverage('dueAt');
      const coverageEffort = ctx.metrics.fieldCoverage('effort');
      const coverageDescription = ctx.metrics.fieldCoverage('description');

      return {
        status: 'ok',
        payload: {
          missingDueAtRatio: 1 - coverageDueAt,
          missingEffortRatio: 1 - coverageEffort,
          missingDescriptionRatio: 1 - coverageDescription,
          qualityScore: clamp(
            (coverageDueAt + coverageEffort + coverageDescription) / 3,
            0,
            1,
          ),
        },
      };
    },
  };
}

export const DEFAULT_WIDGET_REGISTRY: WidgetDefinition[] = [
  executionPriorities(),
  executionBlocked(),
  executionUpcomingDue(),
  executionWipColumns(),
  executionActivity24h(),
  executionNeedInput(),
  progressPercent(),
  progressBurnup(),
  progressThroughput(),
  progressForecast(),
  progressOverdue(),
  progressCriticalAging(),
  progressEffortWeighted(),
  riskHealthScore(),
  riskAgingWip(),
  riskBlockedPersistent(),
  riskOverdueDistribution(),
  riskFlowAnomaly(),
  riskConcentration(),
  riskDataQuality(),
];
