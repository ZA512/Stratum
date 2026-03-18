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
import { BoardActivityReportResponseDto } from './dto/activity-report.dto';

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

  @Get('boards/:boardId/report')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Récupère le rapport d'activité canonique pour un board et son sous-arbre",
  })
  @ApiParam({ name: 'boardId', example: 'board_123' })
  @ApiQuery({ name: 'from', required: false, example: '2026-03-11' })
  @ApiQuery({ name: 'to', required: false, example: '2026-03-18' })
  @ApiQuery({ name: 'actorId', required: false, example: 'user_123' })
  @ApiQuery({
    name: 'eventTypes',
    required: false,
    example: 'COMMENT_ADDED,NODE_MOVED',
  })
  @ApiQuery({ name: 'query', required: false, example: 'devis' })
  @ApiQuery({ name: 'limit', required: false, example: 400 })
  @ApiOkResponse({ type: BoardActivityReportResponseDto })
  async getBoardReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId') boardId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actorId') actorId?: string,
    @Query('eventTypes') eventTypesRaw?: string,
    @Query('query') query?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<BoardActivityReportResponseDto> {
    const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;
    const eventTypes = eventTypesRaw
      ? eventTypesRaw
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : undefined;

    return this.activityService.getBoardReport(boardId, user.id, {
      from,
      to,
      actorId,
      eventTypes,
      query,
      limit,
    });
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
