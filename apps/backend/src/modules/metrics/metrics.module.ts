import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsHttpInterceptor } from './metricsHttp.interceptor';

@Module({
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsHttpInterceptor,
    },
  ],
  controllers: [MetricsController],
  exports: [MetricsService],
})
export class MetricsModule {}
