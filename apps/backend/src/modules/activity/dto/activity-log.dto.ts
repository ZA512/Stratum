import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityType } from '@prisma/client';

export class ActivityLogDto {
  @ApiProperty({ example: 'log_abc123' })
  id!: string;

  @ApiProperty({ example: 'node_xyz789' })
  nodeId!: string;

  @ApiProperty({ example: 34, nullable: true })
  nodeShortId!: number | null;

  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiProperty({ example: 'Alice Dupont' })
  userDisplayName!: string;

  @ApiProperty({ example: 'alice@example.com' })
  userEmail!: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  userAvatarUrl!: string | null;

  @ApiProperty({ enum: ActivityType, example: 'NODE_MOVED' })
  type!: ActivityType;

  @ApiPropertyOptional({
    example: {
      fromColumnId: 'col_1',
      toColumnId: 'col_2',
      fromColumnName: 'EN COURS',
      toColumnName: 'DONE',
    },
  })
  metadata!: Record<string, unknown> | null;

  @ApiProperty({ example: '2025-10-18T12:34:56.789Z' })
  createdAt!: string;
}

export class BoardActivityStatsDto {
  @ApiProperty({ example: 12, description: "Nombre d'activités aujourd'hui" })
  todayCount!: number;
}
