import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardsService } from './dashboards.service';
import type {
  DashboardKind,
  DashboardMode,
  DashboardResponse,
} from './dashboards.types';

const DASHBOARD_IDS: DashboardKind[] = ['EXECUTION', 'PROGRESS', 'RISK'];
const DASHBOARD_MODES: DashboardMode[] = ['SELF', 'AGGREGATED', 'COMPARISON'];

@ApiTags('Dashboards')
@Controller('dashboards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get(':dashboardId')
  @ApiOperation({ summary: 'Retrieve a dashboard with computed widgets' })
  @ApiParam({
    name: 'dashboardId',
    required: true,
    example: 'execution',
    description: 'Dashboard kind (execution | progress | risk)',
  })
  @ApiQuery({
    name: 'teamId',
    required: true,
    description: 'Team identifier owning the board',
    example: 'team_stratum',
  })
  @ApiQuery({
    name: 'boardId',
    required: true,
    description: 'Board identifier to compute widgets for',
    example: 'board_stratum_root',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    description: 'Dashboard mode (SELF, AGGREGATED, COMPARISON)',
    example: 'SELF',
  })
  @ApiOkResponse({ description: 'Computed dashboard payload' })
  @ApiBadRequestResponse({ description: 'Missing or invalid query parameters' })
  async getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId') dashboardId: string,
    @Query('teamId') teamId?: string,
    @Query('boardId') boardId?: string,
    @Query('mode') mode?: string,
  ): Promise<DashboardResponse> {
    if (!teamId) {
      throw new BadRequestException('teamId requis');
    }
    if (!boardId) {
      throw new BadRequestException('boardId requis');
    }

    const resolvedDashboard = this.resolveDashboardKind(dashboardId);
    const resolvedMode = this.resolveMode(mode);

    return this.dashboards.getDashboard({
      userId: user.id,
      teamId,
      boardId,
      dashboard: resolvedDashboard,
      mode: resolvedMode,
    });
  }

  private resolveDashboardKind(candidate: string): DashboardKind {
    const normalized = candidate?.toUpperCase();
    if (!normalized || !DASHBOARD_IDS.includes(normalized as DashboardKind)) {
      throw new BadRequestException('Dashboard invalide');
    }
    return normalized as DashboardKind;
  }

  private resolveMode(candidate?: string | null): DashboardMode {
    if (!candidate) {
      return 'SELF';
    }
    const normalized = candidate.toUpperCase();
    if (!DASHBOARD_MODES.includes(normalized as DashboardMode)) {
      throw new BadRequestException('Mode invalide');
    }
    return normalized as DashboardMode;
  }
}
