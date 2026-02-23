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
          message,
          dto.context ?? {},
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
    message: string,
    context: Record<string, unknown>,
  ): Promise<string | null> {
    const userSettings = await this.usersService.getAiSettings(userId);

    if (!userSettings.aiEnabled) {
      return null;
    }

    const provider = userSettings.provider?.toLowerCase();
    if (!provider || provider === 'heuristic') {
      return null;
    }

    const model =
      userSettings.model ??
      (provider === 'anthropic'
        ? 'claude-3-5-sonnet-latest'
        : provider === 'ollama'
          ? 'llama3.1'
          : 'gpt-4.1-mini');

    const systemPrompt = [
      "Tu es l'assistant IA intégré à Stratum, un outil de gestion de projet kanban.",
      "Tu réponds en français, de façon concise et opérationnelle.",
      "Tu aides à prioriser, analyser l'avancement et formuler des propositions d'action.",
      "Si tu peux formuler une proposition d'action concrète, propose-la.",
    ].join(' ');

    const payload = { message, context };

    const settings = {
      provider,
      model: userSettings.model,
      baseUrl: userSettings.baseUrl,
      apiKey: userSettings.apiKey,
      timeoutMs: userSettings.timeoutMs,
    };

    if (provider === 'anthropic') {
      return this.callAnthropic(model, systemPrompt, payload, settings);
    } else if (provider === 'ollama') {
      return this.callOllama(model, systemPrompt, payload, settings);
    } else {
      return this.callOpenAiCompatible(provider, model, systemPrompt, payload, settings);
    }
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
