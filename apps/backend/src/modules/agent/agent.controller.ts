import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentMetricsService } from './agent-metrics.service';
import { BriefReportService } from './brief-report.service';
import {
  AgentCommandRequestDto,
  AgentCommandResponseDto,
} from './dto/agent-command.dto';
import { AgentChatRequestDto, AgentChatResponseDto } from './dto/agent-chat.dto';
import { AgentService } from './agent.service';

@ApiTags('Agent')
@Controller('workspaces/:workspaceId/agent')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly agentMetrics: AgentMetricsService,
    private readonly briefReport: BriefReportService,
  ) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Metriques agent (observabilite)' })
  @ApiParam({ name: 'workspaceId' })
  getMetrics() {
    return this.agentMetrics.getSummary();
  }

  @Post('command')
  @ApiOperation({
    summary: 'Mode command: génère une proposal structurée (draft)',
  })
  @ApiParam({ name: 'workspaceId', example: 'workspace_123' })
  @ApiBody({ type: AgentCommandRequestDto })
  @ApiOkResponse({ type: AgentCommandResponseDto })
  command(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentCommandRequestDto,
  ): Promise<AgentCommandResponseDto> {
    return this.agentService.command(workspaceId, user.id, dto);
  }

  @Post('chat')
  @ApiOperation({
    summary: 'Mode chat: réponse exploratoire sans mutation canonique',
  })
  @ApiParam({ name: 'workspaceId', example: 'workspace_123' })
  @ApiBody({ type: AgentChatRequestDto })
  @ApiOkResponse({ type: AgentChatResponseDto })
  chat(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentChatRequestDto,
  ): Promise<AgentChatResponseDto> {
    return this.agentService.chat(workspaceId, user.id, dto);
  }

  @Get('brief')
  @ApiOperation({ summary: 'Morning brief: resume des 24 dernieres heures' })
  @ApiParam({ name: 'workspaceId' })
  getMorningBrief(@Param('workspaceId') workspaceId: string) {
    return this.briefReport.getMorningBrief(workspaceId);
  }

  @Get('report')
  @ApiOperation({ summary: 'Rapport hebdomadaire: resume 7 derniers jours' })
  @ApiParam({ name: 'workspaceId' })
  getWeeklyReport(@Param('workspaceId') workspaceId: string) {
    return this.briefReport.getWeeklyReport(workspaceId);
  }

  @Post('suggest')
  @ApiOperation({
    summary: 'Compatibilité legacy vers command (deprecated)',
    deprecated: true,
  })
  @ApiParam({ name: 'workspaceId', example: 'workspace_123' })
  @ApiBody({ type: AgentCommandRequestDto })
  @ApiOkResponse({ type: AgentCommandResponseDto })
  suggestDeprecated(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentCommandRequestDto,
  ): Promise<AgentCommandResponseDto> {
    return this.agentService.command(workspaceId, user.id, dto, {
      deprecatedRoute: true,
    });
  }
}
