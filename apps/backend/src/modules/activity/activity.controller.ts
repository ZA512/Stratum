import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ActivityService } from './activity.service';
import { ActivityLogDto, BoardActivityStatsDto } from './dto/activity-log.dto';

@ApiTags('Activity')
@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('boards/:boardId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Récupère les logs d'activité pour toutes les tâches d'un board",
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 100,
    description: 'Nombre maximum de logs à retourner',
  })
  @ApiOkResponse({ type: ActivityLogDto, isArray: true })
  async getBoardActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Query('limit') limit?: string,
  ): Promise<ActivityLogDto[]> {
    const parsedLimit = limit ? parseInt(limit, 10) : 100;
    return this.activityService.getBoardActivity(boardId, parsedLimit);
  }

  @Get('boards/:boardId/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Compte les activités d'aujourd'hui pour un board",
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiOkResponse({ type: BoardActivityStatsDto })
  async getBoardActivityStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
  ): Promise<BoardActivityStatsDto> {
    const todayCount =
      await this.activityService.getTodayActivityCount(boardId);
    return { todayCount };
  }

  @Get('nodes/:nodeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Récupère les logs d'activité pour une tâche spécifique",
  })
  @ApiParam({ name: 'nodeId', example: 'node_abc' })
  @ApiOkResponse({ type: ActivityLogDto, isArray: true })
  async getNodeActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('nodeId') nodeId: string,
  ): Promise<ActivityLogDto[]> {
    return this.activityService.getNodeActivity(nodeId);
  }
}
