import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({
    description: 'Description de l\'objectif',
    example: 'Livrer le lot façade avant fin de semaine',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({
    description: 'Horizon temporel',
    enum: ['WEEK', 'QUARTER', 'YEAR'],
    example: 'WEEK',
  })
  @IsEnum(['WEEK', 'QUARTER', 'YEAR'] as const)
  horizon!: 'WEEK' | 'QUARTER' | 'YEAR';

  @ApiPropertyOptional({
    description: 'IDs de nodes liés',
    example: ['node_123', 'node_456'],
  })
  @IsOptional()
  linkedNodes?: string[];

  @ApiPropertyOptional({
    description: 'Métrique de succès',
    example: { type: 'tasks_completed', threshold: 5 },
  })
  @IsOptional()
  @IsObject()
  successMetric?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Niveau de confiance initial (0-1)',
    example: 0.7,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceLevel?: number;
}

export class UpdateGoalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED'] })
  @IsOptional()
  @IsEnum(['ACTIVE', 'PAUSED', 'DONE', 'ARCHIVED'] as const)
  status?: 'ACTIVE' | 'PAUSED' | 'DONE' | 'ARCHIVED';

  @ApiPropertyOptional()
  @IsOptional()
  linkedNodes?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  successMetric?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceLevel?: number;
}

export class GoalResponseDto {
  @ApiProperty({ example: 'goal_abc123' })
  id!: string;

  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'Livrer le lot façade' })
  description!: string;

  @ApiProperty({ example: 'WEEK' })
  horizon!: string;

  @ApiProperty({ example: ['node_123'] })
  linkedNodes!: string[];

  @ApiProperty()
  successMetric!: Record<string, unknown>;

  @ApiPropertyOptional({ example: 0.7 })
  confidenceLevel?: number;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  updatedAt!: string;
}
