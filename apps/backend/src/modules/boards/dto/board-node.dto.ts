import { ApiProperty } from '@nestjs/swagger';

export class BoardNodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'SIMPLE', enum: ['SIMPLE', 'MEDIUM', 'COMPLEX'] })
  type!: string;

  @ApiProperty({ example: 'column_backlog' })
  columnId!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'node_root', nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt!: string | null;
}
