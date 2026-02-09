import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { MetricsService } from '../modules/metrics/metrics.service';

const extractSchemaFromConnectionString = (raw: string): string | null => {
  try {
    const url = new URL(raw);
    return url.searchParams.get('schema');
  } catch {
    return null;
  }
};

const normalizePgConnectionString = (raw: string): string => {
  try {
    const url = new URL(raw);
    const schema = url.searchParams.get('schema');
    if (!schema) {
      return raw;
    }
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
};

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');
  private metricsEnabled = false;
  private metricsService?: MetricsService;

  constructor(
    configService: ConfigService,
    @Optional() metricsService?: MetricsService,
  ) {
    const connectionString = configService.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for PrismaClient.');
    }
    const hasSchemaParam = connectionString.includes('schema=');
    const schema = extractSchemaFromConnectionString(connectionString);
    if (schema) {
      const searchPath = `-c search_path=${schema}`;
      const pgOptions = process.env.PGOPTIONS;
      if (!pgOptions || !pgOptions.includes('search_path')) {
        process.env.PGOPTIONS = pgOptions
          ? `${pgOptions} ${searchPath}`
          : searchPath;
      }
    }
    const normalizedConnectionString =
      normalizePgConnectionString(connectionString);
    const adapter = new PrismaPg({
      connectionString: normalizedConnectionString,
    });
    super({ adapter });
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `Prisma DATABASE_URL schema param present: ${hasSchemaParam}`,
      );
    }
    this.metricsService = metricsService;
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
    // Cast pour accéder à $use (type déjà présent mais TS peut râler selon config)
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
