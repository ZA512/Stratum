import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NodesService } from '../nodes/nodes.service';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_INTERVAL_MS = 60 * 1000; // 1 minute safety

@Injectable()
export class WorkflowAutomationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(WorkflowAutomationScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly nodesService: NodesService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.WORKFLOW_AUTOMATION_DISABLED === 'true') {
      this.logger.warn(
        'Workflow automation disabled via WORKFLOW_AUTOMATION_DISABLED',
      );
      return;
    }

    const interval = this.resolveInterval();
    await this.safeRun();
    this.timer = setInterval(() => {
      void this.safeRun();
    }, interval).unref();
    this.logger.log(
      `Workflow automation scheduler started (interval=${interval}ms)`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resolveInterval(): number {
    const raw = Number(
      process.env.WORKFLOW_AUTOMATION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS,
    );
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_INTERVAL_MS;
    }
    return Math.max(raw, MIN_INTERVAL_MS);
  }

  private async safeRun(): Promise<void> {
    try {
      await this.nodesService.runWorkflowAutomation();
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        'Workflow automation tick failed',
        err.stack ?? err.message,
      );
    }
  }
}
