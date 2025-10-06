import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BoardNodeAssigneeDto {
  @ApiProperty({ example: 'user_123' })
  id!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  displayName!: string;

  @ApiProperty({ example: 'https://cdn/avatars/ada.png', nullable: true })
  avatarUrl!: string | null;
}

class BoardNodeRaciDto {
  @ApiProperty({ type: () => [BoardNodeAssigneeDto] })
  responsible!: BoardNodeAssigneeDto[];

  @ApiProperty({ type: () => [BoardNodeAssigneeDto] })
  accountable!: BoardNodeAssigneeDto[];

  @ApiProperty({ type: () => [BoardNodeAssigneeDto] })
  consulted!: BoardNodeAssigneeDto[];

  @ApiProperty({ type: () => [BoardNodeAssigneeDto] })
  informed!: BoardNodeAssigneeDto[];
}

export class BoardNodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 44 })
  shortId!: number;

  @ApiProperty({ example: 'Implement auth flow' })
  title!: string;

  @ApiProperty({ example: 'Synthèse UX du board', nullable: true })
  description?: string | null;

  // type supprimé

  @ApiProperty({ example: 'column_backlog' })
  columnId!: string;

  @ApiProperty({ example: 1 })
  position!: number;

  @ApiProperty({ example: 'node_root', nullable: true })
  parentId!: string | null;

  @ApiProperty({ example: '2025-01-01T12:00:00.000Z', nullable: true })
  dueAt!: string | null;

  @ApiProperty({
    example: 'S',
    enum: ['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL'],
    nullable: true,
  })
  effort?: 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;

  @ApiProperty({
    example: 'HIGH',
    enum: ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'],
  })
  priority?: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';

  @ApiProperty({ example: '2025-02-15T00:00:00.000Z', nullable: true })
  blockedExpectedUnblockAt?: string | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  blockedReminderIntervalDays?: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  blockedReminderDueInDays?: number | null;

  @ApiPropertyOptional({ example: '2025-02-05T09:00:00.000Z', nullable: true })
  blockedReminderLastSentAt?: string | null;

  @ApiPropertyOptional({ example: '2025-02-10T00:00:00.000Z', nullable: true })
  blockedSince?: string | null;

  @ApiProperty({ example: 7, nullable: true })
  estimatedDurationDays?: number | null;

  @ApiProperty({ example: ['infra', 'urgent'], isArray: true, required: false })
  tags?: string[];

  @ApiProperty({
    example: { backlog: 3, inProgress: 1, blocked: 0, done: 5 },
    required: false,
  })
  counts?: {
    backlog: number;
    inProgress: number;
    blocked: number;
    done: number;
  };

  @ApiProperty({ type: () => [BoardNodeAssigneeDto], required: false })
  assignees?: BoardNodeAssigneeDto[];

  @ApiProperty({ example: 45 })
  progress?: number;

  @ApiProperty({ type: () => BoardNodeRaciDto, required: false })
  raci?: BoardNodeRaciDto;

  @ApiPropertyOptional({ example: '2025-02-10T00:00:00.000Z', nullable: true })
  backlogHiddenUntil?: string | null;

  @ApiPropertyOptional({ example: '2025-02-17T00:00:00.000Z', nullable: true })
  backlogNextReviewAt?: string | null;

  @ApiPropertyOptional({ example: '2025-01-31T00:00:00.000Z', nullable: true })
  backlogReviewStartedAt?: string | null;

  @ApiPropertyOptional({ example: '2025-02-02T00:00:00.000Z', nullable: true })
  backlogLastInteractionAt?: string | null;

  @ApiPropertyOptional({ example: '2025-02-09T00:00:00.000Z', nullable: true })
  backlogLastReminderAt?: string | null;

  @ApiPropertyOptional({ example: 'column_backlog', nullable: true })
  lastKnownColumnId?: string | null;

  @ApiPropertyOptional({
    example: 'BACKLOG',
    enum: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CUSTOM'],
    nullable: true,
  })
  lastKnownColumnBehavior?: string | null;

  @ApiPropertyOptional({ example: '2025-03-15T00:00:00.000Z', nullable: true })
  doneArchiveScheduledAt?: string | null;
}
