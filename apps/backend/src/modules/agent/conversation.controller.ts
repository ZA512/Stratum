import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationService } from './conversation.service';
import {
  ConversationMessageResponseDto,
  ConversationSessionDto,
  CreateConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';

@ApiTags('Agent Conversations')
@Controller('workspaces/:workspaceId/agent/conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une session de conversation agent' })
  async create(
    @Param('workspaceId') workspaceId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationSessionDto> {
    return this.conversationService.createSession(
      workspaceId,
      req.user.id,
      dto,
    );
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Récupérer les détails d\'une session' })
  async getSession(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<ConversationSessionDto> {
    return this.conversationService.getSession(workspaceId, sessionId);
  }

  @Post(':sessionId/messages')
  @ApiOperation({ summary: 'Envoyer un message dans une session de conversation' })
  async sendMessage(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Request() req: { user: { id: string } },
    @Body() dto: SendMessageDto,
  ): Promise<ConversationMessageResponseDto> {
    return this.conversationService.sendMessage(
      workspaceId,
      req.user.id,
      sessionId,
      dto,
    );
  }

  @Post(':sessionId/reset')
  @ApiOperation({ summary: 'Réinitialiser une session de conversation' })
  async resetSession(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<ConversationSessionDto> {
    return this.conversationService.resetSession(workspaceId, sessionId);
  }

  @Post(':sessionId/summarize')
  @ApiOperation({ summary: 'Résumer la session de conversation' })
  async summarize(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<{ sessionId: string; summaryVersion: number; summaryText: string }> {
    return this.conversationService.summarize(workspaceId, sessionId);
  }
}
