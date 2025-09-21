import { ApiProperty } from '@nestjs/swagger';

export class NodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 'team_demo' })
  teamId!: string;

  @ApiProperty({ example: null, nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: 'SIMPLE', enum: ['SIMPLE', 'MEDIUM', 'COMPLEX'] })
  type!: string;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'Design OAuth sequence' })
  description?: string | null;

  @ApiProperty({ example: 'node_root/node_123' })
  path!: string;

  @ApiProperty({ example: 1 })
  depth!: number;

  @ApiProperty({ example: 'col_progress', nullable: true })
  columnId!: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt?: string | null;

  @ApiProperty({
    example: { checklistCompleted: 2, checklistTotal: 5 },
    nullable: true,
  })
  statusMetadata?: Record<string, unknown> | null;
}
