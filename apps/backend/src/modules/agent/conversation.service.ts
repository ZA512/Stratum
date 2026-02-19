import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConversationSessionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConversationMessageResponseDto,
  ConversationSessionDto,
  CreateConversationDto,
  SendMessageDto,
} from './dto/conversation.dto';
import { AgentService } from './agent.service';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentService: AgentService,
  ) {}

  async createSession(
    workspaceId: string,
    userId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationSessionDto> {
    const session = await this.prisma.agentConversationSession.create({
      data: {
        workspaceId,
        userId,
        boardId: dto.boardId ?? null,
        focusNodeId: dto.focusNodeId ?? null,
      },
    });

    this.logger.log(
      `Conversation session ${session.id} created for workspace ${workspaceId}`,
    );

    return this.toSessionDto(session);
  }

  async getSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<ConversationSessionDto> {
    const session = await this.prisma.agentConversationSession.findFirst({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException('Session de conversation introuvable');
    }

    return this.toSessionDto(session);
  }

  async sendMessage(
    workspaceId: string,
    userId: string,
    sessionId: string,
    dto: SendMessageDto,
  ): Promise<ConversationMessageResponseDto> {
    const session = await this.prisma.agentConversationSession.findFirst({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException('Session de conversation introuvable');
    }

    if (session.status !== ConversationSessionStatus.ACTIVE) {
      throw new BadRequestException(
        'Cette session n\'est plus active. Créez une nouvelle session.',
      );
    }

    // Delegate to agent chat (which already handles kill-switch, ACL, metrics)
    const chatResponse = await this.agentService.chat(workspaceId, userId, {
      message: dto.message,
      sessionId,
    });

    // Update session timestamp
    await this.prisma.agentConversationSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    // Check if auto-summarize threshold is reached (simplified heuristic: use summary count)
    const summaryCount = await this.prisma.conversationSummary.count({
      where: { sessionId },
    });
    const contextSummarized = summaryCount > 0;

    return {
      workspaceId,
      sessionId,
      answer: chatResponse.answer,
      suggestedCommandPayload: chatResponse.suggestedCommandPayload,
      contextSummarized,
    };
  }

  async resetSession(
    workspaceId: string,
    sessionId: string,
  ): Promise<ConversationSessionDto> {
    const session = await this.prisma.agentConversationSession.findFirst({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException('Session de conversation introuvable');
    }

    const updated = await this.prisma.agentConversationSession.update({
      where: { id: sessionId },
      data: { status: ConversationSessionStatus.RESET },
    });

    this.logger.log(`Conversation session ${sessionId} reset`);

    return this.toSessionDto(updated);
  }

  async summarize(
    workspaceId: string,
    sessionId: string,
  ): Promise<{ sessionId: string; summaryVersion: number; summaryText: string }> {
    const session = await this.prisma.agentConversationSession.findFirst({
      where: { id: sessionId, workspaceId },
    });

    if (!session) {
      throw new NotFoundException('Session de conversation introuvable');
    }

    // Determine next summary version
    const lastSummary = await this.prisma.conversationSummary.findFirst({
      where: { sessionId },
      orderBy: { summaryVersion: 'desc' },
      select: { summaryVersion: true },
    });

    const nextVersion = (lastSummary?.summaryVersion ?? 0) + 1;

    // Create a summary snapshot (placeholder text — will be LLM-generated in production)
    const summaryText = `Résumé v${nextVersion} de la session ${sessionId} — les échanges couverts seront condensés par le moteur LLM.`;

    const summary = await this.prisma.conversationSummary.create({
      data: {
        sessionId,
        summaryVersion: nextVersion,
        summaryText,
        coveredMessageCount: 0, // will be computed by LLM integration
      },
    });

    this.logger.log(
      `Summary v${nextVersion} created for session ${sessionId}`,
    );

    return {
      sessionId: summary.sessionId,
      summaryVersion: summary.summaryVersion,
      summaryText: summary.summaryText,
    };
  }

  private toSessionDto(
    session: {
      id: string;
      workspaceId: string;
      userId: string;
      boardId: string | null;
      focusNodeId: string | null;
      status: ConversationSessionStatus;
      tokenBudget: number;
      createdAt: Date;
      updatedAt: Date;
    },
  ): ConversationSessionDto {
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      userId: session.userId,
      boardId: session.boardId ?? undefined,
      focusNodeId: session.focusNodeId ?? undefined,
      status: session.status,
      tokenBudget: session.tokenBudget,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }
}
