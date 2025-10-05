import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserSettingsModule } from '../user-settings/user-settings.module';
import { DEFAULT_WIDGET_REGISTRY } from './dashboards.registry';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';
import { DashboardsTelemetryService } from './dashboards.telemetry';
import { DASHBOARD_WIDGET_REGISTRY } from './dashboards.tokens';

@Module({
  imports: [PrismaModule, UserSettingsModule],
  controllers: [DashboardsController],
  providers: [
    DashboardsService,
    DashboardsTelemetryService,
    {
      provide: DASHBOARD_WIDGET_REGISTRY,
      useValue: DEFAULT_WIDGET_REGISTRY,
    },
  ],
  exports: [DashboardsService],
})
export class DashboardsModule {}
