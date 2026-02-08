import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({
    example: 'openai',
    description:
      'Provider IA (openai, anthropic, mistral, gemini, ollama, heuristic)',
  })
  provider?: string;

  @ApiPropertyOptional({
    example: 'gpt-4.1-mini',
    description: 'Modèle utilisé par le provider IA',
    nullable: true,
  })
  model?: string | null;

  @ApiPropertyOptional({
    example: 'https://api.openai.com/v1',
    description: 'Base URL pour les providers openai-compatibles',
    nullable: true,
  })
  baseUrl?: string | null;

  @ApiPropertyOptional({
    example: 15000,
    description: 'Timeout IA en millisecondes',
    nullable: true,
  })
  timeoutMs?: number | null;

  @ApiPropertyOptional({
    example: 'sk-xxxx',
    description: 'Clé API (optionnelle, laisser vide pour conserver la valeur)',
    nullable: true,
  })
  apiKey?: string | null;
}

export class AiSettingsDto {
  @ApiProperty({ example: 'openai' })
  provider!: string;

  @ApiProperty({ example: 'gpt-4.1-mini', nullable: true })
  model!: string | null;

  @ApiProperty({ example: 'https://api.openai.com/v1', nullable: true })
  baseUrl!: string | null;

  @ApiProperty({ example: 15000, nullable: true })
  timeoutMs!: number | null;

  @ApiProperty({ example: true })
  hasApiKey!: boolean;

  @ApiProperty({ example: '2026-02-07T12:30:00.000Z', nullable: true })
  updatedAt!: string | null;
}
