import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({ example: 'board_123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  boardId?: string;

  @ApiPropertyOptional({ example: 'node_456' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  focusNodeId?: string;
}

export class SendMessageDto {
  @ApiProperty({
    description: 'Message utilisateur',
    example: 'Quelles sont les tâches bloquées ?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message!: string;
}

export class ConversationSessionDto {
  @ApiProperty({ example: 'session_abc' })
  id!: string;

  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'user_123' })
  userId!: string;

  @ApiPropertyOptional({ example: 'board_123' })
  boardId?: string;

  @ApiPropertyOptional({ example: 'node_456' })
  focusNodeId?: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'ARCHIVED', 'RESET'] })
  status!: string;

  @ApiProperty({ example: 12000 })
  tokenBudget!: number;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-02-19T10:00:00.000Z' })
  updatedAt!: string;
}

export class ConversationMessageResponseDto {
  @ApiProperty({ example: 'workspace_123' })
  workspaceId!: string;

  @ApiProperty({ example: 'session_abc' })
  sessionId!: string;

  @ApiProperty()
  answer!: string;

  @ApiPropertyOptional()
  suggestedCommandPayload?: {
    intent: string;
    context?: Record<string, unknown>;
  };

  @ApiPropertyOptional({
    description: 'Indique si le contexte a été résumé automatiquement',
    example: false,
  })
  contextSummarized?: boolean;
}
