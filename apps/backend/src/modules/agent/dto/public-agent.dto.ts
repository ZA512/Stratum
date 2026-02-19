import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublicAgentCommandRequestDto {
  @ApiProperty({
    description: 'Workspace cible du token public',
    example: 'workspace_123',
  })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

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
    example: 'session_public_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;
}

export class PublicAgentChatRequestDto {
  @ApiProperty({
    description: 'Workspace cible du token public',
    example: 'workspace_123',
  })
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @ApiProperty({
    description: 'Message exploratoire utilisateur',
    example: 'Aide-moi à prioriser les actions de cette semaine',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({
    description: 'Contexte structuré optionnel',
    example: { focusNodeId: 'node_123' },
  })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Identifiant de session conversationnelle côté client',
    example: 'session_public_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;
}