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
    return this.executeCommand(
      workspaceId,
      dto,
      {
        actorType: EventActorType.USER,
        actorId: userId,
        source: EventSource.AGENT,
      },
      {
        feature: 'command',
        deprecatedRoute: options?.deprecatedRoute,
        ensureWorkspaceAccess: true,
      },
    );
  }

  async commandFromPublicToken(
    workspaceId: string,
    tokenId: string,
    dto: AgentCommandRequestDto,
  ): Promise<AgentCommandResponseDto> {
    return this.executeCommand(
      workspaceId,
      dto,
      {
        actorType: EventActorType.SYSTEM,
        actorId: `public_token:${tokenId}`,
        source: EventSource.API,
      },
      {
        feature: 'public.command',
        ensureWorkspaceAccess: false,
      },
    );
  }

  private async executeCommand(
    workspaceId: string,
    dto: AgentCommandRequestDto,
    actor: {
      actorType: EventActorType;
      actorId?: string;
      source: EventSource;
    },
    options: {
      feature: string;
      deprecatedRoute?: boolean;
      ensureWorkspaceAccess: boolean;
    },
  ): Promise<AgentCommandResponseDto> {
    const start = Date.now();
    try {
      this.killSwitch.assertAgentAllowed(workspaceId, options.feature);
      if (options.ensureWorkspaceAccess) {
        if (!actor.actorId) {
          throw new ForbiddenException('Actor id manquant pour verification ACL');
        }
        await this.ensureUserCanAccessWorkspace(workspaceId, actor.actorId);
      } else {
        await this.ensureWorkspaceExists(workspaceId);
      }

    const correlationId = randomUUID();
    const intent = dto.intent.trim();

    const proposal = await this.prisma.proposal.create({
      data: {
        workspaceId,
        intent,
        status: ProposalStatus.DRAFT,
        requestedByUserId:
          actor.actorType === EventActorType.USER ? actor.actorId : null,
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
        actorType: actor.actorType,
        actorId: actor.actorId,
        source: actor.source,
        eventType: 'AGENT_COMMAND_DRAFT_CREATED',
        entityType: 'proposal',
        entityId: proposal.id,
        correlationId,
        proposalId: proposal.id,
        payload: {
          intent,
          deprecatedRoute: options.deprecatedRoute === true,
          isPublicApi: actor.source === EventSource.API,
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
      ...(options.deprecatedRoute
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
    return this.executeChat(
      workspaceId,
      dto,
      {
        actorType: EventActorType.USER,
        actorId: userId,
        source: EventSource.AGENT,
      },
      {
        feature: 'chat',
        ensureWorkspaceAccess: true,
      },
    );
  }

  async chatFromPublicToken(
    workspaceId: string,
    tokenId: string,
    dto: AgentChatRequestDto,
  ): Promise<AgentChatResponseDto> {
    return this.executeChat(
      workspaceId,
      dto,
      {
        actorType: EventActorType.SYSTEM,
        actorId: `public_token:${tokenId}`,
        source: EventSource.API,
      },
      {
        feature: 'public.chat',
        ensureWorkspaceAccess: false,
      },
    );
  }

  private async executeChat(
    workspaceId: string,
    dto: AgentChatRequestDto,
    actor: {
      actorType: EventActorType;
      actorId?: string;
      source: EventSource;
    },
    options: {
      feature: string;
      ensureWorkspaceAccess: boolean;
    },
  ): Promise<AgentChatResponseDto> {
    const start = Date.now();
    try {
      this.killSwitch.assertAgentAllowed(workspaceId, options.feature);
      if (options.ensureWorkspaceAccess) {
        if (!actor.actorId) {
          throw new ForbiddenException('Actor id manquant pour verification ACL');
        }
        await this.ensureUserCanAccessWorkspace(workspaceId, actor.actorId);
      } else {
        await this.ensureWorkspaceExists(workspaceId);
      }

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
        actorType: actor.actorType,
        actorId: actor.actorId,
        source: actor.source,
        eventType: 'AGENT_CHAT_RESPONSE_GENERATED',
        entityType: 'workspace',
        entityId: workspaceId,
        correlationId,
        payload: {
          message,
          hasSuggestedCommandPayload: true,
          sessionId: dto.sessionId ?? null,
          isPublicApi: actor.source === EventSource.API,
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

  private async ensureWorkspaceExists(workspaceId: string): Promise<void> {
    const workspaceBoard = await this.prisma.board.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspaceBoard) {
      throw new NotFoundException('Workspace introuvable');
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
