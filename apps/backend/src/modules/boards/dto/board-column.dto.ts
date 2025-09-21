import { ApiProperty } from '@nestjs/swagger';

export class BoardColumnDto {
  @ApiProperty({ example: 'column_123' })
  id!: string;

  @ApiProperty({ example: 'Backlog' })
  name!: string;

  @ApiProperty({ example: 'BACKLOG' })
  behaviorKey!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: null, nullable: true })
  wipLimit?: number | null;
}
