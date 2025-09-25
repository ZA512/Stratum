import { ApiProperty } from '@nestjs/swagger';
import { TeamDto } from './team.dto';

export class BootstrapTeamResponseDto {
  @ApiProperty({ type: TeamDto })
  team!: TeamDto;

  @ApiProperty({ example: 'root-node-id' })
  rootNodeId!: string;

  @ApiProperty({ example: 'board-id' })
  boardId!: string;
}
