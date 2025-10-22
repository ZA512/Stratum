import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserSettingsService } from '../user-settings/user-settings.service';
import { DASHBOARD_WIDGET_REGISTRY } from './dashboards.tokens';
import {
  BoardContext,
  DashboardHierarchy,
  DashboardRequest,
  DashboardResponse,
  DashboardSnapshot,
  DashboardTask,
  DashboardWidgetEntry,
  DashboardColumn,
  WidgetContext,
  WidgetDefinition,
} from './dashboards.types';
import { DashboardsTelemetryService } from './dashboards.telemetry';

const TASK_PAGE_SIZE = 1000;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userSettings: UserSettingsService,
    @Inject(DASHBOARD_WIDGET_REGISTRY)
    private readonly registry: WidgetDefinition[],
    private readonly telemetry: DashboardsTelemetryService,
  ) {}

  async getDashboard(request: DashboardRequest): Promise<DashboardResponse> {
    const totalStart = process.hrtime.bigint();

    const board = await this.loadBoardContext(request.boardId, request.userId);
    const hierarchy = await this.resolveHierarchy(board);
    const userSettings = await this.userSettings.getOrDefault(request.userId);
    const definitions = this.registry.filter(
      (widget) =>
        widget.dashboard === request.dashboard &&
        widget.supportedModes.includes(request.mode),
    );

    const dependencies = this.collectDependencies(definitions);
    const boardIds = this.resolveBoardIdsForMode(request.mode, hierarchy);

    const tasks = dependencies.needsTasks ? await this.loadTasks(boardIds) : [];
    const snapshots = dependencies.needsSnapshots
      ? await this.loadSnapshots(boardIds)
      : [];
    const columns = dependencies.needsColumns
      ? await this.loadColumns(boardIds)
      : [];

    const datasetRefreshedAt = this.resolveDatasetRefreshedAt(tasks, snapshots);

    const coverageCache = new Map<string, number>();
    const tasksByBoard = new Map<string, DashboardTask[]>();
    const columnsById = new Map<string, DashboardColumn>();
    for (const task of tasks) {
      const bucket = tasksByBoard.get(task.boardId);
      if (bucket) {
        bucket.push(task);
      } else {
        tasksByBoard.set(task.boardId, [task]);
      }
    }
    for (const column of columns) {
      columnsById.set(column.id, column);
    }

    const context: WidgetContext = {
      request,
      board,
      hierarchy,
      tasks,
      snapshots,
      columns,
      preferences: userSettings.preferences,
      now: new Date(),
      metrics: {
        fieldCoverage: (field: string) =>
          this.resolveFieldCoverage(field, tasks, coverageCache),
        tasksForBoard: (boardId: string) => tasksByBoard.get(boardId) ?? [],
        columnForId: (columnId: string) => columnsById.get(columnId),
      },
    };

    const widgets: DashboardWidgetEntry[] = [];
    const hiddenWidgets: DashboardWidgetEntry[] = [];
    const widgetDurations: Record<string, number> = {};
    let widgetErrorCount = 0;

    for (const definition of definitions) {
      const widgetStart = process.hrtime.bigint();
      const requirementResult = this.evaluateRequirements(
        definition,
        context,
        boardIds,
      );

      if (!requirementResult.ready) {
        const durationMs = this.toMilliseconds(
          process.hrtime.bigint() - widgetStart,
        );
        const entry: DashboardWidgetEntry = {
          id: definition.id,
          label: definition.label,
          description: definition.description,
          status: requirementResult.status,
          reason: requirementResult.reason,
          durationMs,
        };
        widgetDurations[definition.id] = durationMs;
        this.telemetry.recordWidget({
          widgetId: definition.id,
          dashboard: definition.dashboard,
          mode: request.mode,
          boardId: request.boardId,
          status: requirementResult.status,
          durationMs,
        });
        hiddenWidgets.push(entry);
        continue;
      }

      try {
        const result = await definition.compute(context);
        const durationMs = this.toMilliseconds(
          process.hrtime.bigint() - widgetStart,
        );
        widgetDurations[definition.id] = durationMs;

        const entry: DashboardWidgetEntry = {
          id: definition.id,
          label: definition.label,
          description: definition.description,
          status: result.status,
          reason: result.reason,
          payload: result.payload,
          meta: result.meta,
          durationMs,
        };

        this.telemetry.recordWidget({
          widgetId: definition.id,
          dashboard: definition.dashboard,
          mode: request.mode,
          boardId: request.boardId,
          status: result.status,
          durationMs,
        });

        if (result.status === 'ok') {
          widgets.push(entry);
        } else {
          hiddenWidgets.push(entry);
        }
      } catch (error) {
        const durationMs = this.toMilliseconds(
          process.hrtime.bigint() - widgetStart,
        );
        widgetDurations[definition.id] = durationMs;
        widgetErrorCount += 1;

        this.telemetry.recordWidgetError(definition.id, error);
        this.telemetry.recordWidget({
          widgetId: definition.id,
          dashboard: definition.dashboard,
          mode: request.mode,
          boardId: request.boardId,
          status: 'error',
          durationMs,
        });

        const reason =
          error instanceof Error
            ? `Erreur interne: ${error.message}`
            : 'Erreur interne inconnue';

        hiddenWidgets.push({
          id: definition.id,
          label: definition.label,
          description: definition.description,
          status: 'no-data',
          reason,
          durationMs,
        });
      }
    }

    const totalDurationMs = this.toMilliseconds(
      process.hrtime.bigint() - totalStart,
    );

    this.telemetry.recordDashboard({
      dashboard: request.dashboard,
      mode: request.mode,
      boardId: request.boardId,
      durationMs: totalDurationMs,
      widgetCount: widgets.length,
      hiddenCount: hiddenWidgets.length,
      errorCount: widgetErrorCount,
    });

    return {
      dashboard: request.dashboard,
      mode: request.mode,
      generatedAt: new Date(),
      datasetRefreshedAt,
      widgets,
      hiddenWidgets,
      metadata: {
        totalDurationMs,
        widgetDurations,
        taskCount: tasks.length,
        boardIds,
      },
    };
  }

  private async loadBoardContext(
    boardId: string,
    userId: string,
  ): Promise<BoardContext> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: {
            id: true,
            title: true,
            path: true,
            depth: true,
            parentId: true,
          },
        },
      },
    });

    if (!board || !board.node) {
      throw new NotFoundException('Board introuvable');
    }

    if (!board.ownerUserId) {
      throw new ForbiddenException('Board sans propriétaire');
    }

    if (board.ownerUserId !== userId) {
      throw new ForbiddenException('Accès au board non autorisé');
    }

    return {
      id: board.id,
      nodeId: board.node.id,
      title: board.node.title,
      path: board.node.path,
      depth: board.node.depth,
      parentId: board.node.parentId,
      ownerUserId: board.ownerUserId,
    };
  }

  private async resolveHierarchy(
    board: BoardContext,
  ): Promise<DashboardHierarchy> {
    const descendants = await this.prisma.board.findMany({
      where: {
        ownerUserId: board.ownerUserId,
        node: {
          path: {
            startsWith: `${board.path}/`,
          },
        },
      },
      include: {
        node: {
          select: {
            id: true,
            title: true,
            path: true,
            depth: true,
            parentId: true,
          },
        },
      },
      orderBy: {
        node: {
          path: 'asc',
        },
      },
    });

    const aggregated: BoardContext[] = [board];
    const seen = new Set<string>([board.id]);
    const descendantPrefix = `${board.path}/`;

    for (const descendant of descendants) {
      const node = descendant.node;
      if (!node) {
        continue;
      }
      if (!node.path.startsWith(descendantPrefix)) {
        continue;
      }
      if (seen.has(descendant.id)) {
        continue;
      }

      aggregated.push({
        id: descendant.id,
        nodeId: node.id,
        title: node.title,
        path: node.path,
        depth: node.depth,
        parentId: node.parentId,
        ownerUserId: board.ownerUserId,
      });
      seen.add(descendant.id);
    }

    const comparison = aggregated
      .filter((candidate) => candidate.parentId === board.nodeId)
      .sort((a, b) => a.path.localeCompare(b.path));

    return {
      self: board,
      aggregated,
      comparison,
    };
  }

  private collectDependencies(definitions: WidgetDefinition[]): {
    needsTasks: boolean;
    needsSnapshots: boolean;
    needsColumns: boolean;
  } {
    let needsTasks = false;
    let needsSnapshots = false;
    let needsColumns = false;

    for (const definition of definitions) {
      if (definition.dataDependencies?.tasks ?? true) {
        needsTasks = true;
      }
      if (definition.dataDependencies?.snapshots) {
        needsSnapshots = true;
      }
      if (definition.dataDependencies?.columns) {
        needsColumns = true;
      }
    }

    return { needsTasks, needsSnapshots, needsColumns };
  }

  private resolveBoardIdsForMode(
    mode: DashboardRequest['mode'],
    hierarchy: DashboardHierarchy,
  ): string[] {
    switch (mode) {
      case 'SELF':
        return [hierarchy.self.id];
      case 'AGGREGATED':
        return hierarchy.aggregated.map((board) => board.id);
      case 'COMPARISON':
        return hierarchy.comparison.map((board) => board.id);
      default:
        return [hierarchy.self.id];
    }
  }

  private async loadTasks(boardIds: string[]): Promise<DashboardTask[]> {
    if (!boardIds.length) {
      return [];
    }

    const where: Prisma.NodeWhereInput = {
      archivedAt: null,
      column: { boardId: { in: boardIds } },
    };

    const select = {
      id: true,
      columnId: true,
      column: {
        select: {
          boardId: true,
          name: true,
          behavior: { select: { key: true } },
        },
      },
      parentId: true,
      title: true,
      description: true,
      dueAt: true,
      startAt: true,
      blockedSince: true,
      blockedReason: true,
      blockedExpectedUnblockAt: true,
      isBlockResolved: true,
      progress: true,
      effort: true,
      priority: true,
      metadata: true,
      statusMetadata: true,
      path: true,
      depth: true,
      createdAt: true,
      updatedAt: true,
      archivedAt: true,
    } satisfies Prisma.NodeSelect;

    const mapped: DashboardTask[] = [];
    let cursor: { id: string } | undefined;

    // Iterate in deterministic order to page through very large datasets.
    for (;;) {
      const batch = await this.prisma.node.findMany({
        where,
        select,
        orderBy: { id: 'asc' },
        take: TASK_PAGE_SIZE,
        ...(cursor ? { skip: 1, cursor } : {}),
      });

      if (!batch.length) {
        break;
      }

      for (const node of batch) {
        if (!node.columnId || !node.column) {
          continue;
        }

        mapped.push({
          id: node.id,
          boardId: node.column.boardId,
          columnId: node.columnId,
          columnBehaviorKey: node.column.behavior?.key ?? null,
          columnName: node.column.name ?? null,
          parentId: node.parentId,
          title: node.title,
          description: node.description ?? null,
          dueAt: node.dueAt,
          startAt: node.startAt,
          blockedSince: node.blockedSince,
          blockedReason: node.blockedReason,
          blockedExpectedUnblockAt: node.blockedExpectedUnblockAt,
          isBlockResolved: node.isBlockResolved ?? false,
          progress: node.progress ?? 0,
          effort: node.effort ?? null,
          priority: node.priority,
          metadata: this.sanitizeTaskMetadata(node.metadata),
          statusMetadata: node.statusMetadata,
          path: node.path,
          depth: node.depth,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          archivedAt: node.archivedAt,
        });
      }

      if (batch.length < TASK_PAGE_SIZE) {
        break;
      }

      const last = batch[batch.length - 1];
      cursor = { id: last.id };
    }

    return mapped;
  }

  private async loadColumns(boardIds: string[]): Promise<DashboardColumn[]> {
    if (!boardIds.length) {
      return [];
    }

    const rows = await this.prisma.column.findMany({
      where: { boardId: { in: boardIds } },
      select: {
        id: true,
        boardId: true,
        name: true,
        position: true,
        wipLimit: true,
        behavior: { select: { key: true } },
      },
    });

    return rows
      .filter((row) => row.behavior?.key)
      .map((row) => ({
        id: row.id,
        boardId: row.boardId,
        name: row.name,
        position: row.position,
        wipLimit: row.wipLimit,
        behaviorKey: row.behavior.key,
      }));
  }

  private async loadSnapshots(
    boardIds: string[],
  ): Promise<DashboardSnapshot[]> {
    if (!boardIds.length) {
      return [];
    }

    const rows: Array<{
      id: string;
      boardId: string;
      dateUTC: Date;
      backlog: number;
      inProgress: number;
      blocked: number;
      done: number;
      total: number;
    }> = await this.prisma.boardDailySnapshot.findMany({
      where: { boardId: { in: boardIds } },
      orderBy: { dateUTC: 'asc' },
      select: {
        id: true,
        boardId: true,
        dateUTC: true,
        backlog: true,
        inProgress: true,
        blocked: true,
        done: true,
        total: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      boardId: row.boardId,
      dateUTC: row.dateUTC,
      backlog: row.backlog,
      inProgress: row.inProgress,
      blocked: row.blocked,
      done: row.done,
      total: row.total,
    }));
  }

  private sanitizeTaskMetadata(
    metadata: Prisma.JsonValue | null,
  ): Prisma.JsonValue | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return metadata;
    }

    const clone = { ...(metadata as Record<string, unknown>) };
    delete clone.financials;
    delete clone.financial;
    delete clone.finance;

    if (!Object.keys(clone).length) {
      return null;
    }

    return clone as Prisma.JsonValue;
  }

  private evaluateRequirements(
    definition: WidgetDefinition,
    context: WidgetContext,
    boardIds: string[],
  ): {
    ready: boolean;
    status: DashboardWidgetEntry['status'];
    reason?: string;
  } {
    if (!definition.requirements) {
      return { ready: true, status: 'ok' };
    }

    const { minItems, minCoverage, historyDays } = definition.requirements;
    if (minItems && context.tasks.length < minItems) {
      return {
        ready: false,
        status: 'no-data',
        reason: `Nombre minimal de tâches non atteint (${context.tasks.length}/${minItems})`,
      };
    }

    if (minCoverage) {
      for (const requirement of minCoverage) {
        const requiredRatio = this.resolveCoverageThreshold(
          requirement,
          context,
        );
        const coverage = context.metrics.fieldCoverage(requirement.field);
        if (coverage < requiredRatio) {
          return {
            ready: false,
            status: 'insufficient-coverage',
            reason: `Couverture insuffisante pour ${requirement.field} (${coverage.toFixed(2)} < ${requiredRatio.toFixed(2)})`,
          };
        }
      }
    }

    if (historyDays) {
      const historyCoverage = this.computeHistoryCoverage(
        context.snapshots,
        boardIds,
      );
      if (historyCoverage < historyDays) {
        return {
          ready: false,
          status: 'insufficient-history',
          reason: `Historique insuffisant (${historyCoverage}/${historyDays} jours)`,
        };
      }
    }

    return { ready: true, status: 'ok' };
  }

  private resolveCoverageThreshold(
    requirement: { field: string; ratio: number; relaxedRatio?: number },
    context: WidgetContext,
  ): number {
    const preferenceThreshold =
      context.preferences.fieldCoverageThreshold ?? requirement.ratio;
    const baseRatio = Math.max(requirement.ratio, preferenceThreshold);

    const lowSampleTaskCount =
      context.preferences.fieldCoverageLowSampleTaskCount ?? 0;

    if (
      !context.tasks.length ||
      lowSampleTaskCount <= 0 ||
      context.tasks.length >= lowSampleTaskCount
    ) {
      return baseRatio;
    }

    const relaxedCandidates: number[] = [];
    if (typeof requirement.relaxedRatio === 'number') {
      relaxedCandidates.push(requirement.relaxedRatio);
    }
    const preferenceRelaxed =
      context.preferences.fieldCoverageLowSampleThreshold;
    if (typeof preferenceRelaxed === 'number') {
      relaxedCandidates.push(preferenceRelaxed);
    }

    if (!relaxedCandidates.length) {
      return baseRatio;
    }

    const relaxedTarget = Math.max(...relaxedCandidates);
    return Math.min(baseRatio, relaxedTarget);
  }

  private computeHistoryCoverage(
    snapshots: DashboardSnapshot[],
    boardIds: string[],
  ): number {
    if (!snapshots.length) {
      return 0;
    }

    const eligible = new Set(boardIds);
    const uniqueDays = new Set<string>();

    for (const snapshot of snapshots) {
      if (!eligible.has(snapshot.boardId)) {
        continue;
      }
      uniqueDays.add(snapshot.dateUTC.toISOString().slice(0, 10));
    }

    return uniqueDays.size;
  }

  private resolveDatasetRefreshedAt(
    tasks: DashboardTask[],
    snapshots: DashboardSnapshot[],
  ): Date | null {
    let latest: Date | null = null;

    for (const task of tasks) {
      if (!latest || task.updatedAt > latest) {
        latest = task.updatedAt;
      }
    }

    for (const snapshot of snapshots) {
      if (!latest || snapshot.dateUTC > latest) {
        latest = snapshot.dateUTC;
      }
    }

    return latest ?? null;
  }

  private resolveFieldCoverage(
    field: string,
    tasks: DashboardTask[],
    cache: Map<string, number>,
  ): number {
    if (!tasks.length) {
      return 0;
    }

    if (cache.has(field)) {
      return cache.get(field)!;
    }

    const accessor = this.createFieldAccessor(field);
    let filled = 0;

    for (const task of tasks) {
      const value = accessor(task);
      if (value !== null && value !== undefined && value !== '') {
        filled += 1;
      }
    }

    const coverage = filled / tasks.length;
    cache.set(field, coverage);
    return coverage;
  }

  private createFieldAccessor(field: string): (task: DashboardTask) => unknown {
    const parts = field.split('.');
    return (task: DashboardTask) => {
      let current: unknown = task;

      for (const part of parts) {
        if (
          current === null ||
          current === undefined ||
          (typeof current !== 'object' && typeof current !== 'function')
        ) {
          return undefined;
        }

        const container = current as Record<string, unknown>;
        current = container[part];
      }

      return current;
    };
  }

  private toMilliseconds(duration: bigint): number {
    return Number(duration) / 1_000_000;
  }
}
