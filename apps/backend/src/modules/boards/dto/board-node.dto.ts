import { ApiProperty } from '@nestjs/swagger';

export class BoardNodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  // type supprimé

  @ApiProperty({ example: 'column_backlog' })
  columnId!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'node_root', nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt!: string | null;

  @ApiProperty({ example: 'S', enum: ['UNDER2MIN','XS','S','M','L','XL','XXL'], nullable: true })
  effort?: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;

  @ApiProperty({ example: 'HIGH', enum: ['NONE','CRITICAL','HIGH','MEDIUM','LOW','LOWEST'] })
  priority?: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';

  @ApiProperty({ example: '2025-02-15T00:00:00.000Z', nullable: true })
  blockedExpectedUnblockAt?: string | null;

  @ApiProperty({ example: ['infra','urgent'], isArray: true, required: false })
  tags?: string[];

  @ApiProperty({
    example: { backlog: 3, inProgress: 1, blocked: 0, done: 5 },
    required: false,
  })
  counts?: { backlog: number; inProgress: number; blocked: number; done: number };
}
