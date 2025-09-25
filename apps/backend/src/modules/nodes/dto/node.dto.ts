import { ApiProperty } from '@nestjs/swagger';

export class NodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 44 })
  shortId!: number;

  @ApiProperty({ example: 'team_demo' })
  teamId!: string;

  @ApiProperty({ example: null, nullable: true })
  parentId!: string | null;

  // Champ 'type' supprimé (legacy)

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

  @ApiProperty({ example: 40 })
  progress!: number; // 0-100

  @ApiProperty({ example: ['personne@example.com'], isArray: true })
  blockedReminderEmails!: string[];

  @ApiProperty({ example: 3, nullable: true })
  blockedReminderIntervalDays!: number | null;

  @ApiProperty({ example: '2025-02-10T10:00:00.000Z', nullable: true })
  blockedExpectedUnblockAt!: string | null;

  @ApiProperty({
    example: 'HIGH',
    enum: ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'],
  })
  priority!: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';

  @ApiProperty({
    example: 'S',
    enum: ['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    nullable: true,
  })
  effort!: 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;

  @ApiProperty({ example: ['infra', 'urgent'], isArray: true })
  tags!: string[];
}
