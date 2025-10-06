import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BoardNodeDto } from './board-node.dto';

export class BoardColumnWithNodesDto {
  @ApiProperty({ example: 'column_backlog' })
  id!: string;

  @ApiProperty({ example: 'Backlog' })
  name!: string;

  @ApiProperty({ example: 'BACKLOG' })
  behaviorKey!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: 5, nullable: true })
  wipLimit!: number | null;

  @ApiProperty({ type: BoardNodeDto, isArray: true })
  nodes!: BoardNodeDto[];

  @ApiPropertyOptional({ type: Object, nullable: true })
  settings?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: { archived: 2, snoozed: 1 } })
  badges?: { archived: number; snoozed: number };
}
