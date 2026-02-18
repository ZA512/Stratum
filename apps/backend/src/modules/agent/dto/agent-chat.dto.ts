import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AgentChatRequestDto {
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
    example: 'session_abc123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;
}

export class AgentChatResponseDto {
  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'chat_123' })
  correlationId!: string;

  @ApiProperty({
    example: 'Je te propose de cibler d’abord les éléments BLOQUÉS, puis les échéances < 7 jours.',
  })
  answer!: string;

  @ApiPropertyOptional({
    description: 'Payload suggéré pour basculer explicitement vers le mode command',
    type: 'object',
    additionalProperties: true,
    example: {
      intent: 'Priorise les éléments BLOQUÉS et ceux échéance < 7 jours',
      context: { strategy: 'blocked_then_due' },
    },
  })
  suggestedCommandPayload?: {
    intent: string;
    context?: Record<string, unknown>;
  };
}
