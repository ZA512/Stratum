import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AiConfigResponseDto {
  @ApiProperty({ example: 'config_abc' })
  id!: string;

  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: true })
  aiEnabled!: boolean;

  @ApiProperty({ example: 'HEAVY', enum: ['OFF', 'LIGHT', 'EMBEDDING', 'HEAVY'] })
  aiLevel!: string;

  @ApiPropertyOptional({ example: 'openai' })
  llmProvider?: string;

  @ApiPropertyOptional({ example: 'gpt-4.1' })
  llmModel?: string;

  @ApiPropertyOptional({ example: 'text-embedding-3-large' })
  embeddingProvider?: string;

  @ApiPropertyOptional({ example: 'text-embedding-3-large' })
  embeddingModel?: string;

  @ApiPropertyOptional({ example: 0.2 })
  temperature?: number;

  @ApiPropertyOptional({ example: 50 })
  maxEntitiesPerProposal?: number;

  @ApiPropertyOptional({ example: 'v1.0' })
  systemPromptVersion?: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  updatedAt!: string;
}

export class UpdateAiConfigDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  aiEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['OFF', 'LIGHT', 'EMBEDDING', 'HEAVY'] })
  @IsOptional()
  @IsEnum(['OFF', 'LIGHT', 'EMBEDDING', 'HEAVY'] as const)
  aiLevel?: 'OFF' | 'LIGHT' | 'EMBEDDING' | 'HEAVY';

  @ApiPropertyOptional({ example: 'openai' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  llmProvider?: string;

  @ApiPropertyOptional({ example: 'gpt-4.1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  llmModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  llmBaseUrl?: string;

  @ApiPropertyOptional({ example: 'openai' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  embeddingProvider?: string;

  @ApiPropertyOptional({ example: 'text-embedding-3-large' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  embeddingModel?: string;

  @ApiPropertyOptional({ example: 0.2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ example: 0.9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({ example: 2500 })
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100000)
  maxTokens?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxEntitiesPerProposal?: number;
}

export class AiUsageQueryDto {
  @ApiPropertyOptional({ example: '2026-02-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-02-28T23:59:59.000Z' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class AiUsageSummaryDto {
  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty()
  period!: { from: string; to: string };

  @ApiProperty()
  totalPromptTokens!: number;

  @ApiProperty()
  totalCompletionTokens!: number;

  @ApiProperty()
  totalEmbeddingTokens!: number;

  @ApiProperty()
  estimatedCostUsd!: number;

  @ApiProperty()
  requestCount!: number;
}

// ── Model Catalog DTOs ──────────────────────────────────────────────

export type AiFeature =
  | 'proposals'
  | 'chat'
  | 'embeddings'
  | 'summarization'
  | 'briefs';

export type ModelTier = 'budget' | 'balanced' | 'premium';

export class ModelEntryDto {
  @ApiProperty({ example: 'openai' })
  provider!: string;

  @ApiProperty({ example: 'gpt-4.1-mini' })
  modelId!: string;

  @ApiProperty({ example: 'GPT-4.1 Mini' })
  displayName!: string;

  @ApiProperty({ example: 'balanced', enum: ['budget', 'balanced', 'premium'] })
  tier!: ModelTier;

  @ApiProperty({ example: 0.4, description: 'USD per 1M input tokens' })
  costPer1MInput!: number;

  @ApiProperty({ example: 1.6, description: 'USD per 1M output tokens' })
  costPer1MOutput!: number;

  @ApiPropertyOptional({
    example: 0.02,
    description: 'USD per 1M embedding tokens (embedding models only)',
  })
  costPer1MEmbedding?: number;

  @ApiProperty({ example: 128000 })
  contextWindow!: number;

  @ApiProperty({ example: 4, description: '1-5 quality rating' })
  qualityRating!: number;

  @ApiProperty({ example: 4, description: '1-5 speed rating' })
  speedRating!: number;

  @ApiProperty({
    example: ['proposals', 'chat'],
    description: 'AI features this model is recommended for',
  })
  recommendedFor!: AiFeature[];

  @ApiProperty({ example: 'Excellent rapport qualité/prix pour la plupart des usages.' })
  advice!: string;
}

export class FeatureGuideDto {
  @ApiProperty({ example: 'proposals' })
  feature!: AiFeature;

  @ApiProperty({ example: 'Génération de propositions' })
  label!: string;

  @ApiProperty({ example: 'Nécessite un modèle avec de bonnes capacités de raisonnement.' })
  description!: string;

  @ApiProperty({ example: 'gpt-4.1-mini' })
  recommendedModelId!: string;

  @ApiProperty({ example: ['reasoning', 'structured-output'] })
  requiredCapabilities!: string[];
}

export class ModelCatalogResponseDto {
  @ApiProperty({ type: [ModelEntryDto] })
  models!: ModelEntryDto[];

  @ApiProperty({ type: [FeatureGuideDto] })
  featureGuides!: FeatureGuideDto[];

  @ApiProperty({ example: '2025-07-01', description: 'Date of last catalog update' })
  catalogVersion!: string;
}
