import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  Optional,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { MetricsService } from '../modules/metrics/metrics.service';
import { ensureDatabaseUrlEnv } from './prisma.utils';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');
  private metricsEnabled = false;

  constructor(@Optional() private readonly metricsService?: MetricsService) {
    ensureDatabaseUrlEnv();
    super();
    this.metricsEnabled = process.env.METRICS_ENABLED === 'true';
    // plus de wrapper local: utilisation directe via metricsService.recordPrisma
    this.installMiddleware();
  }

  private installMiddleware() {
    if (!this.metricsEnabled) return;
    // Guard: ensure Prisma client instance exposes $use before using middleware
    if (typeof (this as any).$use !== 'function') {
      this.logger.warn(
        '$use middleware not available on Prisma client - skipping metrics middleware',
      );
      return;
    }
    // Cast pour acc├®der ├á $use (type d├®j├á pr├®sent mais TS peut r├óler selon config)
    (this as any).$use(
      async (params: any, next: (p: any) => Promise<unknown>) => {
        const start = process.hrtime();
        const model = params.model || 'raw';
        const action = params.action || 'unknown';
        try {
          const result: unknown = await next(params);
          const diff = process.hrtime(start);
          const seconds = diff[0] + diff[1] / 1e9;
          this.metricsService?.recordPrisma(model, action, 'ok', seconds);
          return result;
        } catch (e: any) {
          const diff = process.hrtime(start);
          const seconds = diff[0] + diff[1] / 1e9;
          const category = this.categorizeError(e);
          this.metricsService?.recordPrisma(
            model,
            action,
            'error',
            seconds,
            category,
          );
          throw e;
        }
      },
    );
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
