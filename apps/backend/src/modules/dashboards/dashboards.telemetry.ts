import { Injectable, Logger } from '@nestjs/common';
import { DashboardKind, DashboardMode } from './dashboards.types';

type WidgetStatus =
  | 'ok'
  | 'no-data'
  | 'insufficient-coverage'
  | 'insufficient-history'
  | 'error';

interface WidgetMetric {
  widgetId: string;
  dashboard: DashboardKind;
  mode: DashboardMode;
  boardId: string;
  durationMs: number;
  status: WidgetStatus;
}

interface DashboardMetric {
  dashboard: DashboardKind;
  mode: DashboardMode;
  boardId: string;
  durationMs: number;
  widgetCount: number;
  hiddenCount: number;
  errorCount: number;
}

@Injectable()
export class DashboardsTelemetryService {
  private readonly logger = new Logger(DashboardsTelemetryService.name);
  private readonly widgetErrorCounts = new Map<string, number>();

  recordDashboard(metric: DashboardMetric): void {
    this.logger.log(
      `dashboard=${metric.dashboard} mode=${metric.mode} board=${metric.boardId} durationMs=${metric.durationMs.toFixed(
        2,
      )} widgetCount=${metric.widgetCount} hiddenCount=${metric.hiddenCount} errorCount=${metric.errorCount}`,
    );
  }

  recordWidget(metric: WidgetMetric): void {
    const level = metric.status === 'error' ? 'warn' : 'debug';
    const message = `widget=${metric.widgetId} dashboard=${metric.dashboard} mode=${metric.mode} board=${metric.boardId} status=${metric.status} durationMs=${metric.durationMs.toFixed(
      2,
    )}`;

    if (level === 'warn') {
      this.logger.warn(message);
    } else {
      this.logger.debug(message);
    }
  }

  recordWidgetError(widgetId: string, error?: unknown): number {
    const next = (this.widgetErrorCounts.get(widgetId) ?? 0) + 1;
    this.widgetErrorCounts.set(widgetId, next);

    if (error instanceof Error) {
      this.logger.error(
        `widget=${widgetId} error=${error.message}`,
        error.stack,
      );
    } else if (error) {
      this.logger.error(`widget=${widgetId} error=${JSON.stringify(error)}`);
    }

    return next;
  }

  getWidgetErrorCounts(): Record<string, number> {
    return Object.fromEntries(this.widgetErrorCounts.entries());
  }
}
