import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({
    example: true,
    description: "Active ou désactive l'IA pour cet utilisateur",
  })
  aiEnabled?: boolean;

  @ApiPropertyOptional({
    example: 'openai',
    description:
      'Provider LLM (openai, anthropic, mistral, gemini, ollama, heuristic, custom)',
  })
  provider?: string;

  @ApiPropertyOptional({
    example: 'gpt-4.1-mini',
    description: 'Modèle LLM (chat, proposals, quick notes)',
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
    description: 'Clé API LLM (laisser vide pour conserver)',
    nullable: true,
  })
  apiKey?: string | null;

  @ApiPropertyOptional({
    example: 'openai',
    description: 'Provider pour les embeddings RAG (openai, mistral, custom)',
    nullable: true,
  })
  embeddingProvider?: string | null;

  @ApiPropertyOptional({
    example: 'text-embedding-3-small',
    description: 'Modèle d\'embedding pour la recherche RAG',
    nullable: true,
  })
  embeddingModel?: string | null;
}

export class AiSettingsDto {
  @ApiProperty({ example: true })
  aiEnabled!: boolean;

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

  @ApiProperty({ example: 'openai', nullable: true })
  embeddingProvider!: string | null;

  @ApiProperty({ example: 'text-embedding-3-small', nullable: true })
  embeddingModel!: string | null;

  @ApiProperty({ example: '2026-02-07T12:30:00.000Z', nullable: true })
  updatedAt!: string | null;
}
