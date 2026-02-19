import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'URL cible pour les notifications webhook',
    example: 'https://example.com/webhooks/stratum',
  })
  @IsUrl({ require_tld: false, protocols: ['https'] })
  @IsNotEmpty()
  url!: string;

  @ApiProperty({
    description: 'Types d\'événements à écouter',
    example: ['AGENT_COMMAND_DRAFT_CREATED', 'PROPOSAL_APPLIED'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[];

  @ApiPropertyOptional({
    description: 'Description du webhook',
    example: 'Notification Slack pour proposals',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class WebhookResponseDto {
  @ApiProperty({ example: 'wh_abc123' })
  id!: string;

  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'https://example.com/webhooks/stratum' })
  url!: string;

  @ApiProperty({ example: ['AGENT_COMMAND_DRAFT_CREATED'] })
  eventTypes!: string[];

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiPropertyOptional({ example: 'Notification Slack' })
  description?: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  createdAt!: string;
}
