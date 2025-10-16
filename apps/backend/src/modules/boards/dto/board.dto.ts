import { ApiProperty } from '@nestjs/swagger';
import { BoardColumnDto } from './board-column.dto';

export class BoardDto {
  @ApiProperty({ example: 'board_123' })
  id!: string;

  @ApiProperty({ example: 'node_root' })
  nodeId!: string;

  @ApiProperty({ example: 'Stratum Launch' })
  name!: string;

  @ApiProperty({ type: BoardColumnDto, isArray: true })
  columns!: BoardColumnDto[];

  @ApiProperty({ example: 'user_abc', nullable: true })
  ownerUserId!: string | null;

  @ApiProperty({ example: true })
  isPersonal!: boolean;
}
