import { Injectable, OnModuleDestroy, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { MetricsService } from '../modules/metrics/metrics.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');
  private metricsEnabled = false;

  constructor(@Optional() private readonly metricsService?: MetricsService) {
    super();
    this.metricsEnabled = process.env.METRICS_ENABLED === 'true';
    // plus de wrapper local: utilisation directe via metricsService.recordPrisma
    this.installMiddleware();
  }

  private installMiddleware() {
    if (!this.metricsEnabled) return;
    // Cast pour accéder à $use (type déjà présent mais TS peut râler selon config)
    (this as any).$use(async (params: any, next: any) => {
      const start = process.hrtime();
      const model = params.model || 'raw';
      const action = params.action || 'unknown';
      try {
        const result = await next(params);
        const diff = process.hrtime(start);
        const seconds = diff[0] + diff[1] / 1e9;
        this.metricsService?.recordPrisma(model, action, 'ok', seconds);
        return result;
      } catch (e: any) {
        const diff = process.hrtime(start);
        const seconds = diff[0] + diff[1] / 1e9;
        const category = this.categorizeError(e);
        this.metricsService?.recordPrisma(model, action, 'error', seconds, category);
        throw e;
      }
    });
    this.logger.log('Prisma metrics middleware actif');
  }

  private categorizeError(e: any): string {
    if (!e) return 'other';
    if (e.code === 'P2002') return 'unique';
    if (e.code === 'P2025') return 'not_found';
    return 'other';
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
