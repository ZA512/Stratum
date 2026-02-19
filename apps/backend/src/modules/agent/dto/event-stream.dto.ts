import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class EventStreamQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor (event ID) pour reprendre depuis un point précis',
    example: 'evt_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par type d\'événement',
    example: 'AGENT_COMMAND_DRAFT_CREATED',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;

  @ApiPropertyOptional({
    description: 'Nombre max d\'événements par batch (polling)',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class EventStreamItemDto {
  @ApiProperty({ example: 'evt_abc123' })
  id!: string;

  @ApiProperty({ example: 'AGENT_COMMAND_DRAFT_CREATED' })
  eventType!: string;

  @ApiProperty({ example: 'proposal' })
  entityType!: string;

  @ApiProperty({ example: 'proposal_123' })
  entityId!: string;

  @ApiProperty({ example: 'USER' })
  actorType!: string;

  @ApiPropertyOptional({ example: 'user_123' })
  actorId?: string;

  @ApiProperty()
  payload!: Record<string, unknown>;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  createdAt!: string;
}

export class EventStreamResponseDto {
  @ApiProperty({ type: [EventStreamItemDto] })
  events!: EventStreamItemDto[];

  @ApiPropertyOptional({
    description: 'Curseur pour la page suivante (null si fin)',
    example: 'evt_xyz789',
  })
  nextCursor?: string | null;

  @ApiProperty({ example: false })
  hasMore!: boolean;
}
