import { ColumnBehaviorKey, Effort, Priority, Prisma } from '@prisma/client';
import { DashboardPreferences } from '../user-settings/user-settings.types';

export type DashboardKind = 'EXECUTION' | 'PROGRESS' | 'RISK';
export type DashboardMode = 'SELF' | 'AGGREGATED' | 'COMPARISON';

export interface DashboardRequest {
  userId: string;
  teamId: string;
  boardId: string;
  dashboard: DashboardKind;
  mode: DashboardMode;
}

export interface BoardContext {
  id: string;
  nodeId: string;
  title: string;
  teamId: string;
  path: string;
  depth: number;
  parentId: string | null;
}

export interface DashboardHierarchy {
  self: BoardContext;
  aggregated: BoardContext[];
  comparison: BoardContext[];
}

export interface DashboardTask {
  id: string;
  boardId: string;
  columnId: string;
  columnBehaviorKey: ColumnBehaviorKey | null;
  columnName: string | null;
  parentId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  startAt: Date | null;
  blockedSince: Date | null;
  blockedReason: string | null;
  blockedExpectedUnblockAt: Date | null;
  isBlockResolved: boolean;
  progress: number;
  effort: Effort | null;
  priority: Priority;
  metadata: Prisma.JsonValue | null;
  statusMetadata: Prisma.JsonValue | null;
  path: string;
  depth: number;
  teamId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface DashboardSnapshot {
  id: string;
  boardId: string;
  dateUTC: Date;
  backlog: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
}

export interface DashboardColumn {
  id: string;
  boardId: string;
  behaviorKey: ColumnBehaviorKey;
  name: string;
  position: number;
  wipLimit: number | null;
}

export interface WidgetContext {
  request: DashboardRequest;
  board: BoardContext;
  hierarchy: DashboardHierarchy;
  tasks: DashboardTask[];
  snapshots: DashboardSnapshot[];
  columns: DashboardColumn[];
  preferences: DashboardPreferences;
  now: Date;
  metrics: {
    fieldCoverage(field: string): number;
    tasksForBoard(boardId: string): DashboardTask[];
    columnForId(columnId: string): DashboardColumn | undefined;
  };
}

export type WidgetStatus =
  | 'ok'
  | 'no-data'
  | 'insufficient-coverage'
  | 'insufficient-history';

export interface WidgetResult {
  status: WidgetStatus;
  reason?: string;
  payload?: unknown;
  meta?: Record<string, unknown>;
}

export interface WidgetDefinition {
  id: string;
  dashboard: DashboardKind;
  label: string;
  description: string;
  supportedModes: DashboardMode[];
  requirements?: {
    minItems?: number;
    minCoverage?: Array<{
      field: string;
      ratio: number;
      relaxedRatio?: number;
    }>;
    historyDays?: number;
  };
  dataDependencies?: {
    tasks?: boolean;
    snapshots?: boolean;
    columns?: boolean;
  };
  compute(ctx: WidgetContext): Promise<WidgetResult>;
}

export interface DashboardWidgetEntry extends WidgetResult {
  id: string;
  label: string;
  description: string;
  durationMs: number;
}

export interface DashboardResponse {
  dashboard: DashboardKind;
  mode: DashboardMode;
  generatedAt: Date;
  datasetRefreshedAt: Date | null;
  widgets: DashboardWidgetEntry[];
  hiddenWidgets: DashboardWidgetEntry[];
  metadata: {
    totalDurationMs: number;
    widgetDurations: Record<string, number>;
    taskCount: number;
    boardIds: string[];
  };
}
