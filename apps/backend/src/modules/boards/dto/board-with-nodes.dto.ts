import { ApiProperty } from '@nestjs/swagger';
import { BoardColumnWithNodesDto } from './board-column-with-nodes.dto';

export class BoardWithNodesDto {
  @ApiProperty({ example: 'board_123' })
  id!: string;

  @ApiProperty({ example: 'node_root' })
  nodeId!: string;

  @ApiProperty({ example: 'Stratum Launch' })
  name!: string;

  @ApiProperty({ type: BoardColumnWithNodesDto, isArray: true })
  columns!: BoardColumnWithNodesDto[];

  @ApiProperty({
    example: false,
    description: 'True if board has shared tasks with other users',
  })
  isShared!: boolean;
}
