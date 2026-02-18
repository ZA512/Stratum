import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentCommandRequestDto {
  @ApiProperty({
    description: 'Intention utilisateur orientée action',
    example: 'Réorganise les tâches bloquées du lot façade',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  intent!: string;

  @ApiPropertyOptional({
    description: 'Contexte structuré optionnel injecté par le client',
    example: { focusNodeId: 'node_123', maxEntities: 20 },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Identifiant de session conversationnelle côté client',
    example: 'session_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;
}

export class AgentCommandAlternativeDto {
  @ApiProperty({ example: 1 })
  alternativeNo!: number;

  @ApiProperty({
    example: 'Proposition initiale à valider',
  })
  summary!: string;

  @ApiProperty({
    example: 0.35,
    description: 'Score de confiance initial entre 0 et 1',
  })
  confidenceScore!: number;

  @ApiProperty({
    description: 'Actions proposées (vide en AN-P0-02, rempli en P0-03)',
    example: [],
    type: 'array',
    items: { type: 'object', additionalProperties: true },
  })
  actions!: Array<Record<string, unknown>>;
}

export class AgentCommandResponseDto {
  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'cmd_123' })
  correlationId!: string;

  @ApiProperty({ example: 'proposal_123' })
  proposalId!: string;

  @ApiProperty({ example: 'DRAFT' })
  proposalStatus!: string;

  @ApiProperty({ example: 'command' })
  mode!: 'command';

  @ApiProperty({
    type: AgentCommandAlternativeDto,
    isArray: true,
  })
  alternatives!: AgentCommandAlternativeDto[];

  @ApiPropertyOptional({
    description: 'Message de compatibilité, présent quand route deprecated utilisée',
    example: 'Endpoint deprecated. Utilisez /agent/command.',
  })
  deprecationWarning?: string;
}
