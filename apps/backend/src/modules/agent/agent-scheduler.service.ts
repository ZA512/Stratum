import { Injectable, Logger } from '@nestjs/common';
import { SchedulerJobType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KillSwitchService } from './kill-switch.service';
import { BriefReportService } from './brief-report.service';
import { WebhookService } from './webhook.service';

export interface SchedulerJobConfig {
  id: string;
  workspaceId: string;
  jobType: SchedulerJobType;
  cronExpression: string;
  enabled: boolean;
  lastRunAt?: Date | null;
  nextRunAt?: Date | null;
}

/**
 * AN-P2-05 — Scheduler autonome orienté objectifs.
 *
 * Exécute des revues périodiques et proposals proactives par workspace.
 * Schedule configurable, kill-switchable par feature.
 * Jobs persistés en DB (table SchedulerJob).
 */
@Injectable()
export class AgentSchedulerService {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private running = false;
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitch: KillSwitchService,
    private readonly briefReport: BriefReportService,
    private readonly webhookService: WebhookService,
  ) {}

  /** Register (upsert) a scheduled job for a workspace */
  async registerJob(
    workspaceId: string,
    jobType: SchedulerJobType,
    cronExpression: string,
  ): Promise<SchedulerJobConfig> {
    const job = await this.prisma.schedulerJob.upsert({
      where: { workspaceId_jobType: { workspaceId, jobType } },
      create: {
        workspaceId,
        jobType,
        cronExpression,
        enabled: true,
        nextRunAt: this.computeNextRun(cronExpression, new Date()),
      },
      update: {
        cronExpression,
        enabled: true,
        nextRunAt: this.computeNextRun(cronExpression, new Date()),
      },
    });

    this.logger.log(
      `Scheduler job registered: ${job.id} (${job.jobType}) for workspace ${workspaceId}`,
    );

    return this.toConfig(job);
  }

  /** Disable a job */
  async disableJob(workspaceId: string, jobType: SchedulerJobType): Promise<void> {
    await this.prisma.schedulerJob.updateMany({
      where: { workspaceId, jobType },
      data: { enabled: false },
    });
  }

  /** List all registered jobs */
  async listJobs(workspaceId?: string): Promise<SchedulerJobConfig[]> {
    const jobs = await this.prisma.schedulerJob.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((j) => this.toConfig(j));
  }

  /** Start the scheduler polling loop */
  start(intervalMs = 60_000): void {
    if (this.running) return;
    this.running = true;
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error('Scheduler tick error', err),
      );
    }, intervalMs);
    this.logger.log(`Scheduler started (interval: ${intervalMs}ms)`);
  }

  /** Stop the scheduler */
  stop(): void {
    if (!this.running) return;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.running = false;
    this.logger.log('Scheduler stopped');
  }

  /** One scheduler tick — evaluate all due jobs */
  async tick(): Promise<void> {
    const now = new Date();

    const dueJobs = await this.prisma.schedulerJob.findMany({
      where: {
        enabled: true,
        OR: [
          { nextRunAt: null },
          { nextRunAt: { lte: now } },
        ],
      },
    });

    for (const job of dueJobs) {
      try {
        this.killSwitch.assertAgentAllowed(job.workspaceId, 'scheduler');
        await this.executeJob(job);

        await this.prisma.schedulerJob.update({
          where: { id: job.id },
          data: {
            lastRunAt: now,
            nextRunAt: this.computeNextRun(job.cronExpression, now),
            errorCount: 0,
            lastErrorMessage: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Scheduler job ${job.id} skipped: ${message}`);

        await this.prisma.schedulerJob.update({
          where: { id: job.id },
          data: {
            errorCount: { increment: 1 },
            lastErrorMessage: message,
            // Still advance nextRunAt to avoid busy-looping
            nextRunAt: this.computeNextRun(job.cronExpression, now),
          },
        });
      }
    }
  }

  private async executeJob(
    job: { id: string; workspaceId: string; jobType: SchedulerJobType },
  ): Promise<void> {
    this.logger.log(`Executing scheduler job: ${job.id} (${job.jobType})`);

    switch (job.jobType) {
      case SchedulerJobType.MORNING_BRIEF: {
        const brief = await this.briefReport.getMorningBrief(job.workspaceId);
        await this.webhookService.dispatch(
          job.workspaceId,
          'SCHEDULER_MORNING_BRIEF',
          `sched_${job.id}_${Date.now()}`,
          brief as unknown as Record<string, unknown>,
        );
        break;
      }

      case SchedulerJobType.WEEKLY_REPORT: {
        const report = await this.briefReport.getWeeklyReport(job.workspaceId);
        await this.webhookService.dispatch(
          job.workspaceId,
          'SCHEDULER_WEEKLY_REPORT',
          `sched_${job.id}_${Date.now()}`,
          report as unknown as Record<string, unknown>,
        );
        break;
      }

      case SchedulerJobType.STAGNATION_CHECK: {
        await this.checkStagnation(job.workspaceId);
        break;
      }

      case SchedulerJobType.WIP_OVERLOAD_CHECK: {
        await this.checkWipOverload(job.workspaceId);
        break;
      }
    }
  }

  private async checkStagnation(workspaceId: string): Promise<void> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stagnantNodes = await this.prisma.node.findMany({
      where: {
        column: {
          board: { id: workspaceId },
          behavior: {
            key: { in: ['IN_PROGRESS', 'BLOCKED'] },
          },
        },
        archivedAt: null,
        updatedAt: { lt: sevenDaysAgo },
      },
      select: { id: true, title: true, updatedAt: true },
      take: 20,
    });

    if (stagnantNodes.length > 0) {
      await this.webhookService.dispatch(
        workspaceId,
        'SCHEDULER_STAGNATION_DETECTED',
        `stagnation_${workspaceId}_${Date.now()}`,
        {
          stagnantCount: stagnantNodes.length,
          nodes: stagnantNodes.map((n) => ({
            id: n.id,
            title: n.title,
            lastUpdate: n.updatedAt.toISOString(),
          })),
        },
      );
    }
  }

  private async checkWipOverload(workspaceId: string): Promise<void> {
    const columns = await this.prisma.column.findMany({
      where: {
        boardId: workspaceId,
        wipLimit: { not: null },
      },
      select: {
        id: true,
        name: true,
        wipLimit: true,
        _count: { select: { nodes: { where: { archivedAt: null } } } },
      },
    });

    const overloaded = columns.filter(
      (col) => col.wipLimit && col._count.nodes > col.wipLimit,
    );

    if (overloaded.length > 0) {
      await this.webhookService.dispatch(
        workspaceId,
        'SCHEDULER_WIP_OVERLOAD_DETECTED',
        `wip_${workspaceId}_${Date.now()}`,
        {
          overloadedColumns: overloaded.map((col) => ({
            id: col.id,
            name: col.name,
            wipLimit: col.wipLimit,
            currentCount: col._count.nodes,
          })),
        },
      );
    }
  }

  /**
   * Simplified cron parser — supports basic expressions like:
   * "0 8 * * *" (daily at 8am) → next run = tomorrow 8am
   * "0 8 * * 1" (monday 8am) → next run = next monday 8am
   */
  private computeNextRun(cron: string, from: Date): Date {
    const parts = cron.split(/\s+/);
    if (parts.length >= 5) {
      const minute = parseInt(parts[0], 10);
      const hour = parseInt(parts[1], 10);
      const dayOfWeek = parseInt(parts[4], 10);

      if (!isNaN(hour) && !isNaN(minute)) {
        const next = new Date(from);
        next.setHours(hour, minute, 0, 0);

        if (next <= from) {
          next.setDate(next.getDate() + 1);
        }

        if (!isNaN(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6) {
          while (next.getDay() !== dayOfWeek) {
            next.setDate(next.getDate() + 1);
          }
        }

        return next;
      }
    }

    // Fallback: next run = from + 24h
    return new Date(from.getTime() + 24 * 60 * 60 * 1000);
  }

  private toConfig(job: {
    id: string;
    workspaceId: string;
    jobType: SchedulerJobType;
    cronExpression: string;
    enabled: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
  }): SchedulerJobConfig {
    return {
      id: job.id,
      workspaceId: job.workspaceId,
      jobType: job.jobType,
      cronExpression: job.cronExpression,
      enabled: job.enabled,
      lastRunAt: job.lastRunAt,
      nextRunAt: job.nextRunAt,
    };
  }
}
