import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { AuthModule } from './modules/auth/auth.module';
import { BoardsModule } from './modules/boards/boards.module';
import { NodesModule } from './modules/nodes/nodes.module';
import { TeamsModule } from './modules/teams/teams.module';
import { UsersModule } from './modules/users/users.module';
import { UserSettingsModule } from './modules/user-settings/user-settings.module';
import { DashboardSnapshotsModule } from './modules/dashboard-snapshots/dashboard-snapshots.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { WorkflowAutomationModule } from './modules/workflow-automation/workflow-automation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    TeamsModule,
    BoardsModule,
    NodesModule,
    UserSettingsModule,
    DashboardSnapshotsModule,
    DashboardsModule,
    MetricsModule,
    WorkflowAutomationModule,

  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
