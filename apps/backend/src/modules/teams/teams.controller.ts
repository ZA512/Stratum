import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TeamDto } from './dto/team.dto';
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
}
