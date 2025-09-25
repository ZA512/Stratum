import { Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TeamDto } from './dto/team.dto';
import { BootstrapTeamResponseDto } from './dto/bootstrap-team-response.dto';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { TeamsService } from './teams.service';

@ApiTags('Teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List teams for the authenticated user' })
  @ApiOkResponse({ type: TeamDto, isArray: true })
  listTeams(): Promise<TeamDto[]> {
    return this.teamsService.listTeams();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a single team' })
  @ApiParam({ name: 'id', example: 'team_demo' })
  @ApiOkResponse({ type: TeamDto })
  getTeam(@Param('id') id: string): Promise<TeamDto> {
    return this.teamsService.getTeam(id);
  }

  @Post('bootstrap')
  @ApiOperation({
    summary: 'Bootstrap initial pour un utilisateur sans equipe',
  })
  @ApiOkResponse({ type: BootstrapTeamResponseDto })
  async bootstrap(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<BootstrapTeamResponseDto> {
    if (!user) {
      // Dans un contexte réel on renverrait 401; simplification ici
      throw new Error('Non authentifie');
    }
    const result = await this.teamsService.bootstrapForUser(user.id);
    return {
      team: result.team,
      rootNodeId: result.rootNodeId,
      boardId: result.boardId,
    };
  }
}
