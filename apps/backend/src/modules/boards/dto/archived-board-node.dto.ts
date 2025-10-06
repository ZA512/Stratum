import { ApiProperty } from '@nestjs/swagger';
import { ColumnBehaviorKey } from '@prisma/client';

export class ArchivedBoardNodeDto {
  @ApiProperty({ example: 'node_123' })
  id!: string;

  @ApiProperty({ example: 42, nullable: true })
  shortId!: number | null;

  @ApiProperty({ example: 'Nouvelle fonctionnalité' })
  title!: string;

  @ApiProperty({ example: '2025-01-12T08:00:00.000Z' })
  archivedAt!: string;

  @ApiProperty({ example: 'column_backlog', nullable: true })
  lastKnownColumnId!: string | null;

  @ApiProperty({
    enum: [
      ColumnBehaviorKey.BACKLOG,
      ColumnBehaviorKey.IN_PROGRESS,
      ColumnBehaviorKey.BLOCKED,
      ColumnBehaviorKey.DONE,
      ColumnBehaviorKey.CUSTOM,
    ],
    nullable: true,
  })
  lastKnownBehavior!: ColumnBehaviorKey | null;

  @ApiProperty({ example: '2025-01-19T00:00:00.000Z', nullable: true })
  backlogNextReviewAt!: string | null;

  @ApiProperty({ example: '2025-01-12T00:00:00.000Z', nullable: true })
  backlogReviewStartedAt!: string | null;

  @ApiProperty({ example: '2025-01-10T00:00:00.000Z', nullable: true })
  backlogHiddenUntil!: string | null;

  @ApiProperty({ example: '2025-02-20T00:00:00.000Z', nullable: true })
  doneArchiveScheduledAt!: string | null;

  @ApiProperty({ example: '2025-01-05T00:00:00.000Z', nullable: true })
  dueAt!: string | null;
}
