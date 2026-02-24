import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EventActorType,
  EventSource,
  MembershipStatus,
  Prisma,
  ProposalStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  AgentCommandRequestDto,
  AgentCommandResponseDto,
} from './dto/agent-command.dto';
import { AgentChatRequestDto, AgentChatResponseDto } from './dto/agent-chat.dto';
import { KillSwitchService } from './kill-switch.service';
import { AgentMetricsService } from './agent-metrics.service';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly killSwitch: KillSwitchService,
    private readonly metrics: AgentMetricsService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
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

    const heuristicAnswer =
      'Je te propose une priorisation en 3 étapes: 1) traiter les éléments BLOQUÉS, 2) sécuriser les échéances proches, 3) regrouper les actions rapides. Si tu veux, je peux générer une proposition structurée.';

    let answer = heuristicAnswer;

    // Appel LLM si l'utilisateur a configuré et activé l'IA
    if (actor.actorType === EventActorType.USER && actor.actorId) {
      try {
        const llmAnswer = await this.tryCallLlmForChat(
          actor.actorId,
          workspaceId,
          message,
        );
        if (llmAnswer) {
          answer = llmAnswer;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Agent LLM chat fallback heuristique: ${msg}`);
      }
    }

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

  // ── LLM calling ────────────────────────────────────────────────────────────

  private async tryCallLlmForChat(
    userId: string,
    workspaceId: string,
    message: string,
  ): Promise<string | null> {
    const userSettings = await this.usersService.getAiSettings(userId);

    if (!userSettings.aiEnabled) return null;

    const provider = userSettings.provider?.toLowerCase();
    if (!provider || provider === 'heuristic') return null;

    const model =
      userSettings.model ??
      (provider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : provider === 'ollama'
          ? 'llama3.1'
          : 'gpt-4.1-mini');

    const workspaceData = await this.loadWorkspaceContext(workspaceId);

    const systemPrompt = [
      "Tu es l'assistant IA intégré à Stratum, un outil de gestion de projet kanban.",
      "Tu réponds exclusivement en te basant sur les données du workspace fournies ci-dessous.",
      "Ne génère JAMAIS de questions génériques ou de listes vides : réponds avec les vraies données.",
      "Si une donnée n'existe pas dans le contexte, dis-le clairement et cite les éléments proches que tu as trouvés.",
      "Sois concis, précis, opérationnel. Format markdown autorisé.",
    ].join(' ');

    const llmPayload = { message, workspace: workspaceData };

    const settings = {
      provider,
      model: userSettings.model,
      baseUrl: userSettings.baseUrl,
      apiKey: userSettings.apiKey,
      timeoutMs: userSettings.timeoutMs,
    };

    if (provider === 'anthropic') {
      return this.callAnthropic(model, systemPrompt, llmPayload, settings);
    } else if (provider === 'ollama') {
      return this.callOllama(model, systemPrompt, llmPayload, settings);
    } else {
      return this.callOpenAiCompatible(provider, model, systemPrompt, llmPayload, settings);
    }
  }

  /**
   * Charge les données réelles du workspace depuis la DB pour les injecter dans le prompt.
   * Limité pour tenir dans le contexte LLM (<= ~200 tâches).
   */
  private async loadWorkspaceContext(workspaceId: string): Promise<Record<string, unknown>> {
    const board = await this.prisma.board.findUnique({
      where: { id: workspaceId },
      select: {
        node: { select: { title: true, description: true } },
        columns: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            name: true,
            behavior: { select: { key: true } },
            nodes: {
              where: { archivedAt: null },
              orderBy: [{ priority: 'asc' }, { dueAt: 'asc' }, { position: 'asc' }],
              take: 30,
              select: {
                id: true,
                title: true,
                description: true,
                priority: true,
                effort: true,
                progress: true,
                dueAt: true,
                startAt: true,
                tags: true,
                kind: true,
                blockedReason: true,
                blockedSince: true,
                createdAt: true,
                updatedAt: true,
                assignments: {
                  select: {
                    user: { select: { displayName: true, email: true } },
                    role: true,
                  },
                },
                comments: {
                  orderBy: { createdAt: 'desc' },
                  take: 3,
                  select: {
                    body: true,
                    createdAt: true,
                    author: { select: { displayName: true } },
                  },
                },
                children: {
                  where: { archivedAt: null },
                  select: { id: true, title: true, progress: true, priority: true },
                  take: 10,
                },
              },
            },
          },
        },
      },
    });

    if (!board) return { error: 'Workspace introuvable' };

    return {
      name: board.node.title,
      description: board.node.description ?? null,
      columns: board.columns.map((col) => ({
        id: col.id,
        name: col.name,
        behavior: col.behavior.key,
        tasks: col.nodes.map((node) => ({
          id: node.id,
          title: node.title,
          description: node.description ?? null,
          kind: node.kind,
          priority: node.priority,
          effort: node.effort ?? null,
          progress: node.progress,
          dueAt: node.dueAt?.toISOString() ?? null,
          startAt: node.startAt?.toISOString() ?? null,
          tags: node.tags,
          blocked: node.blockedReason
            ? { reason: node.blockedReason, since: node.blockedSince?.toISOString() ?? null }
            : null,
          assignees: node.assignments.map((a) => ({
            name: a.user.displayName,
            email: a.user.email,
            role: a.role,
          })),
          recentComments: node.comments.map((c) => ({
            author: c.author.displayName,
            body: c.body,
            at: c.createdAt.toISOString(),
          })),
          subtasks: node.children.map((ch) => ({
            title: ch.title,
            progress: ch.progress,
            priority: ch.priority,
          })),
          createdAt: node.createdAt.toISOString(),
          updatedAt: node.updatedAt.toISOString(),
        })),
      })),
    };
  }

  private async callOpenAiCompatible(
    provider: string,
    model: string,
    systemPrompt: string,
    payload: Record<string, unknown>,
    settings: { baseUrl: string | null; apiKey: string | null; timeoutMs: number | null },
  ): Promise<string | null> {
    const baseUrl =
      settings.baseUrl ??
      (provider === 'openai' || provider === 'custom'
        ? 'https://api.openai.com/v1'
        : provider === 'mistral'
          ? 'https://api.mistral.ai/v1'
          : provider === 'gemini'
            ? 'https://generativelanguage.googleapis.com/v1beta/openai'
            : null);

    if (!baseUrl) throw new Error('AI_BASE_URL requis pour ce provider.');
    if (!settings.apiKey) throw new Error('AI_API_KEY manquant.');

    const response = await this.postJson(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      },
      settings.timeoutMs,
    );

    const content =
      response?.choices?.[0]?.message?.content ??
      response?.choices?.[0]?.text ??
      null;
    return typeof content === 'string' ? content.trim() : null;
  }

  private async callAnthropic(
    model: string,
    systemPrompt: string,
    payload: Record<string, unknown>,
    settings: { baseUrl: string | null; apiKey: string | null; timeoutMs: number | null },
  ): Promise<string | null> {
    const baseUrl = settings.baseUrl ?? 'https://api.anthropic.com/v1';
    if (!settings.apiKey) throw new Error('AI_API_KEY manquant.');

    const response = await this.postJson(
      `${baseUrl.replace(/\/$/, '')}/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: 'user', content: JSON.stringify(payload) }],
        }),
      },
      settings.timeoutMs,
    );

    const content = Array.isArray(response?.content)
      ? response.content.find((part: { type?: string; text?: string }) => part?.type === 'text')?.text
      : null;
    return typeof content === 'string' ? content.trim() : null;
  }

  private async callOllama(
    model: string,
    systemPrompt: string,
    payload: Record<string, unknown>,
    settings: { baseUrl: string | null; timeoutMs: number | null },
  ): Promise<string | null> {
    const baseUrl = settings.baseUrl ?? 'http://localhost:11434';

    const response = await this.postJson(
      `${baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      },
      settings.timeoutMs,
    );

    const content = response?.message?.content ?? null;
    return typeof content === 'string' ? content.trim() : null;
  }

  private async postJson(
    url: string,
    init: Record<string, unknown>,
    timeoutOverride?: number | null,
  ): Promise<any> {
    const fetchFn = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Fetch non disponible dans cet environnement.');
    }

    const timeoutMsRaw =
      typeof timeoutOverride === 'number'
        ? timeoutOverride
        : Number(this.config.get<string>('AI_TIMEOUT_MS') ?? 15_000) || 15_000;
    const timeoutMs = Math.max(3_000, Math.min(timeoutMsRaw, 120_000));

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetchFn(url, {
        ...(init as object),
        signal: abortController.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      }
      if (!text.trim()) return {};
      return JSON.parse(text);
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Workspace access guards ─────────────────────────────────────────────────

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
