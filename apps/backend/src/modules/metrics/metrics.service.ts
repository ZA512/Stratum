import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Registry,
  Histogram,
  Counter,
  Gauge,
} from 'prom-client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MetricsService {
  private readonly register: Registry;
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpErrorsTotal: Counter<string>;
  readonly activeUsersGauge: Gauge<string>;
  // Prisma dedicated metrics
  readonly prismaQueryDuration: Histogram<string>;
  readonly prismaQueriesTotal: Counter<string>;
  readonly prismaErrorsTotal: Counter<string>;
  private readonly enabled: boolean;
  private readonly sampleRate: number;
  private snapshotTimer?: NodeJS.Timeout;
  private loopLagTimer?: NodeJS.Timeout;
  // Business gauges
  readonly nodesTotal?: Gauge<string>;
  readonly nodesBlockedTotal?: Gauge<string>;
  readonly refreshTokensActive?: Gauge<string>;
  readonly backupAgeSeconds?: Gauge<string>;
  readonly eventLoopLagSeconds?: Gauge<string>;
  private prisma?: PrismaClient; // Injected lazily to avoid circular imports

  constructor() {
    this.enabled = process.env.METRICS_ENABLED === 'true';
    this.register = new Registry();
    this.sampleRate = Number(process.env.METRICS_HTTP_SAMPLE_RATE || '1') || 1;

    if (this.enabled) {
      collectDefaultMetrics({ register: this.register, prefix: 'stratum_' });

      this.httpRequestsTotal = new Counter({
        name: 'stratum_http_requests_total',
        help: 'Total des requêtes HTTP',
        labelNames: ['method', 'route', 'status'],
        registers: [this.register],
      });

      this.httpRequestDuration = new Histogram({
        name: 'stratum_http_request_duration_seconds',
        help: 'Durée des requêtes HTTP en secondes',
        labelNames: ['method', 'route', 'status'],
        buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
        registers: [this.register],
      });

      this.httpErrorsTotal = new Counter({
        name: 'stratum_http_errors_total',
        help: 'Total des réponses 5xx',
        labelNames: ['method', 'route'],
        registers: [this.register],
      });

      this.activeUsersGauge = new Gauge({
        name: 'stratum_active_users_placeholder',
        help: 'Placeholder (ex: utilisateurs actifs, à implémenter plus tard)',
        registers: [this.register],
      });

      // Prisma metrics
      this.prismaQueryDuration = new Histogram({
        name: 'stratum_prisma_query_duration_seconds',
        help: 'Durée des requêtes Prisma (DB) en secondes',
        labelNames: ['model', 'action', 'status'],
        buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
        registers: [this.register],
      });
      this.prismaQueriesTotal = new Counter({
        name: 'stratum_prisma_queries_total',
        help: 'Total des requêtes Prisma',
        labelNames: ['model', 'action', 'status'],
        registers: [this.register],
      });
      this.prismaErrorsTotal = new Counter({
        name: 'stratum_prisma_errors_total',
        help: 'Erreurs Prisma categorizées',
        labelNames: ['model', 'action', 'error'],
        registers: [this.register],
      });

      // Business gauges
      this.nodesTotal = new Gauge({
        name: 'stratum_nodes_total',
        help: 'Total des nodes',
        registers: [this.register],
      });
      this.nodesBlockedTotal = new Gauge({
        name: 'stratum_nodes_blocked_total',
        help: 'Nodes bloqués non résolus',
        registers: [this.register],
      });
      this.refreshTokensActive = new Gauge({
        name: 'stratum_refresh_tokens_active',
        help: 'Tokens de refresh actifs (non expirés, non révoqués)',
        registers: [this.register],
      });
      this.backupAgeSeconds = new Gauge({
        name: 'stratum_backup_age_seconds',
        help: 'Âge du backup le plus récent en secondes',
        registers: [this.register],
      });
      this.eventLoopLagSeconds = new Gauge({
        name: 'stratum_event_loop_lag_seconds',
        help: "Lag estimé de la boucle d'évènements Node.js (moyenne approximative)",
        registers: [this.register],
        labelNames: ['phase'],
      });
    } else {
      // Créer des stubs no-op pour éviter les if partout
      this.httpRequestsTotal = new Counter({
        name: 'noop_total',
        help: 'noop',
        registers: [],
      });
      this.httpRequestDuration = new Histogram({
        name: 'noop_duration',
        help: 'noop',
        registers: [],
      });
      this.httpErrorsTotal = new Counter({
        name: 'noop_errors',
        help: 'noop',
        registers: [],
      });
      this.activeUsersGauge = new Gauge({
        name: 'noop_gauge',
        help: 'noop',
        registers: [],
      });
      this.prismaQueryDuration = new Histogram({
        name: 'noop_prisma_duration',
        help: 'noop',
        registers: [],
      });
      this.prismaQueriesTotal = new Counter({
        name: 'noop_prisma_total',
        help: 'noop',
        registers: [],
      });
      this.prismaErrorsTotal = new Counter({
        name: 'noop_prisma_errors',
        help: 'noop',
        registers: [],
      });
      this.nodesTotal = undefined;
      this.nodesBlockedTotal = undefined;
      this.refreshTokensActive = undefined;
      this.backupAgeSeconds = undefined;
      this.eventLoopLagSeconds = undefined;
    }

    if (this.enabled) {
      this.startSchedulers();
    }
  }

  private extractSchema(raw: string): string | null {
    try {
      const url = new URL(raw);
      return url.searchParams.get('schema');
    } catch {
      return null;
    }
  }

  private normalizeConnectionString(raw: string): string {
    try {
      const url = new URL(raw);
      const schema = url.searchParams.get('schema');
      if (!schema) return raw;
      url.searchParams.delete('schema');
      const options = url.searchParams.get('options');
      const searchPath = `-c search_path=${schema}`;
      url.searchParams.set(
        'options',
        options ? `${options} ${searchPath}` : searchPath,
      );
      return url.toString();
    } catch {
      return raw;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getMetrics(): Promise<string> {
    if (!this.enabled) {
      return '# Metrics disabled (set METRICS_ENABLED=true)\n';
    }
    return this.register.metrics();
  }

  /* ---------------------- Recording Helpers ---------------------- */
  recordHttp(
    method: string,
    route: string,
    status: number,
    durationSeconds: number,
    isError: boolean,
  ) {
    if (!this.enabled) return;
    if (this.sampleRate < 1 && Math.random() > this.sampleRate) return; // sampling
    const statusStr = String(status);
    this.httpRequestsTotal.inc({ method, route, status: statusStr });
    this.httpRequestDuration.observe(
      { method, route, status: statusStr },
      durationSeconds,
    );
    if (isError || status >= 500) {
      this.httpErrorsTotal.inc({ method, route });
    }
  }

  recordPrisma(
    model: string,
    action: string,
    status: 'ok' | 'error',
    seconds: number,
    errorCategory?: string,
  ) {
    if (!this.enabled) return;
    this.prismaQueriesTotal.inc({ model, action, status });
    this.prismaQueryDuration.observe({ model, action, status }, seconds);
    if (status === 'error' && errorCategory) {
      this.prismaErrorsTotal.inc({ model, action, error: errorCategory });
    }
  }

  /* ---------------------- Schedulers ---------------------- */
  private startSchedulers() {
    const intervalMs = Number(
      process.env.METRICS_ENTITY_SNAPSHOT_INTERVAL_MS || '15000',
    );
    this.snapshotTimer = setInterval(() => {
      void this.safeCollectBusiness();
      void this.safeCollectBackupAge();
    }, intervalMs).unref();

    const loopLagInterval = Number(
      process.env.METRICS_EVENT_LOOP_INTERVAL_MS || '5000',
    );
    this.loopLagTimer = setInterval(() => {
      void this.measureEventLoopLag(loopLagInterval);
    }, loopLagInterval).unref();
  }

  private async safeCollectBusiness() {
    try {
      if (!this.prisma) {
        // charge dynamique pour éviter import direct circulaire
        const datasourceUrl = process.env.DATABASE_URL;
        if (!datasourceUrl) {
          this.prisma = new PrismaClient();
        } else {
          const schema = this.extractSchema(datasourceUrl);
          if (schema) {
            const searchPath = `-c search_path=${schema}`;
            const pgOptions = process.env.PGOPTIONS;
            if (!pgOptions || !pgOptions.includes('search_path')) {
              process.env.PGOPTIONS = pgOptions
                ? `${pgOptions} ${searchPath}`
                : searchPath;
            }
          }
          const normalized = this.normalizeConnectionString(datasourceUrl);
          const adapter = new PrismaPg({ connectionString: normalized });
          this.prisma = new PrismaClient({ adapter });
        }
      }
      if (this.nodesTotal) {
        const total = await this.prisma.node.count();
        this.nodesTotal.set(total);
      }
      if (this.nodesBlockedTotal) {
        const blocked = await this.prisma.node.count({
          where: { blockedSince: { not: null }, isBlockResolved: false },
        });
        this.nodesBlockedTotal.set(blocked);
      }
      if (this.refreshTokensActive) {
        const now = new Date();
        const active = await this.prisma.refreshToken.count({
          where: { revokedAt: null, expiresAt: { gt: now } },
        });
        this.refreshTokensActive.set(active);
      }
    } catch {
      // swallow errors to avoid crashing metrics
    }
  }

  private safeCollectBackupAge() {
    if (!this.backupAgeSeconds) return;
    if (process.env.METRICS_BACKUP_AGE_ENABLED !== 'true') return;
    const dir = process.env.BACKUP_DIR || '/opt/stratum_backups';
    try {
      if (!fs.existsSync(dir)) return;
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith('stratum_') && f.endsWith('.dump'))
        .map((f) => path.join(dir, f));
      if (files.length === 0) return;
      files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      const newest = files[0];
      const ageSeconds = (Date.now() - fs.statSync(newest).mtimeMs) / 1000;
      this.backupAgeSeconds.set(ageSeconds);
    } catch {
      // ignore
    }
  }

  private measureEventLoopLag(intervalMs: number) {
    if (!this.eventLoopLagSeconds) return;
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const diffNs = Number(process.hrtime.bigint() - start);
      const lagSeconds = diffNs / 1e9 - intervalMs / 1000;
      const safe = Math.max(0, lagSeconds);
      this.eventLoopLagSeconds?.set({ phase: 'max' }, safe); // simplified (could average samples)
    });
  }
}
