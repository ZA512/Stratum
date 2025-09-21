import { ApiProperty } from '@nestjs/swagger';

export class NodeChildBoardDto {
  @ApiProperty({ example: 'node_child' })
  nodeId!: string;

  @ApiProperty({ example: 'board_child' })
  boardId!: string;

  @ApiProperty({ example: 'Delivery Board' })
  name!: string;
}
