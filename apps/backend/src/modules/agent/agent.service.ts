import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventActorType,
  EventSource,
  MembershipStatus,
  Prisma,
  ProposalStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AgentCommandRequestDto,
  AgentCommandResponseDto,
} from './dto/agent-command.dto';
import { AgentChatRequestDto, AgentChatResponseDto } from './dto/agent-chat.dto';
import { KillSwitchService } from './kill-switch.service';
import { AgentMetricsService } from './agent-metrics.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitch: KillSwitchService,
    private readonly metrics: AgentMetricsService,
  ) {}

  async command(
    workspaceId: string,
    userId: string,
    dto: AgentCommandRequestDto,
    options?: { deprecatedRoute?: boolean },
  ): Promise<AgentCommandResponseDto> {
    const start = Date.now();
    try {
      this.killSwitch.assertAgentAllowed(workspaceId, 'command');
      await this.ensureUserCanAccessWorkspace(workspaceId, userId);

    const correlationId = randomUUID();
    const intent = dto.intent.trim();

    const proposal = await this.prisma.proposal.create({
      data: {
        workspaceId,
        intent,
        status: ProposalStatus.DRAFT,
        requestedByUserId: userId,
        alternativesCount: 1,
        actions: {
          create: {
            alternativeNo: 1,
            actionOrder: 1,
            actionType: 'REVIEW_REQUIRED',
            payload: {
              intent,
              context: dto.context ?? {},
              sessionId: dto.sessionId ?? null,
            } as Prisma.InputJsonValue,
          },
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    await this.prisma.eventLog.create({
      data: {
        workspaceId,
        actorType: EventActorType.USER,
        actorId: userId,
        source: EventSource.AGENT,
        eventType: 'AGENT_COMMAND_DRAFT_CREATED',
        entityType: 'proposal',
        entityId: proposal.id,
        correlationId,
        proposalId: proposal.id,
        payload: {
          intent,
          deprecatedRoute: options?.deprecatedRoute === true,
        },
      },
    });

    this.metrics.recordProposalCreated();

    const result: AgentCommandResponseDto = {
      workspaceId,
      correlationId,
      proposalId: proposal.id,
      proposalStatus: proposal.status,
      mode: 'command',
      alternatives: [
        {
          alternativeNo: 1,
          summary: 'Proposition initiale à valider',
          confidenceScore: 0.35,
          actions: [],
        },
      ],
      ...(options?.deprecatedRoute
        ? {
            deprecationWarning:
              'Endpoint deprecated. Utilisez /workspaces/:workspaceId/agent/command.',
          }
        : {}),
    };

    this.metrics.recordCommand(Date.now() - start);
    return result;
    } catch (error) {
      this.metrics.recordCommand(Date.now() - start, true);
      throw error;
    }
  }

  async chat(
    workspaceId: string,
    userId: string,
    dto: AgentChatRequestDto,
  ): Promise<AgentChatResponseDto> {
    const start = Date.now();
    try {
      this.killSwitch.assertAgentAllowed(workspaceId, 'chat');
      await this.ensureUserCanAccessWorkspace(workspaceId, userId);

    const correlationId = randomUUID();
    const message = dto.message.trim();

    const answer =
      'Je te propose une priorisation en 3 étapes: 1) traiter les éléments BLOQUÉS, 2) sécuriser les échéances proches, 3) regrouper les actions rapides. Si tu veux, je peux générer une proposition structurée.';

    const suggestedCommandPayload = {
      intent: `Priorise le workspace selon ce message: ${message}`,
      context: dto.context ?? {},
    };

    await this.prisma.eventLog.create({
      data: {
        workspaceId,
        actorType: EventActorType.USER,
        actorId: userId,
        source: EventSource.AGENT,
        eventType: 'AGENT_CHAT_RESPONSE_GENERATED',
        entityType: 'workspace',
        entityId: workspaceId,
        correlationId,
        payload: {
          message,
          hasSuggestedCommandPayload: true,
          sessionId: dto.sessionId ?? null,
        },
      },
    });

    const result: AgentChatResponseDto = {
      workspaceId,
      correlationId,
      answer,
      suggestedCommandPayload,
    };

    this.metrics.recordChat(Date.now() - start);
    return result;
    } catch (error) {
      this.metrics.recordChat(Date.now() - start, true);
      throw error;
    }
  }

  private async ensureUserCanAccessWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<void> {
    const workspaceBoard = await this.prisma.board.findUnique({
      where: { id: workspaceId },
      select: {
        ownerUserId: true,
        node: { select: { teamId: true } },
      },
    });

    if (!workspaceBoard) {
      throw new NotFoundException('Workspace introuvable');
    }

    if (workspaceBoard.ownerUserId) {
      if (workspaceBoard.ownerUserId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez pas accéder à ce workspace personnel',
        );
      }
      return;
    }

    const teamId = workspaceBoard.node.teamId;
    const membership = await this.prisma.membership.findFirst({
      where: {
        teamId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission d'accéder à ce workspace",
      );
    }
  }
}
