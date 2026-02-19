import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkspaceAiLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AiConfigResponseDto,
  AiUsageSummaryDto,
  ModelCatalogResponseDto,
  ModelEntryDto,
  FeatureGuideDto,
  UpdateAiConfigDto,
} from './dto/ai-config.dto';

@Injectable()
export class AiConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(workspaceId: string): Promise<AiConfigResponseDto> {
    let config = await this.prisma.workspaceAiConfig.findUnique({
      where: { workspaceId },
    });

    if (!config) {
      // Create default config if none exists
      config = await this.prisma.workspaceAiConfig.create({
        data: {
          workspaceId,
          aiEnabled: false,
          aiLevel: WorkspaceAiLevel.OFF,
        },
      });
    }

    return this.toResponse(config);
  }

  async updateConfig(
    workspaceId: string,
    dto: UpdateAiConfigDto,
  ): Promise<AiConfigResponseDto> {
    const existing = await this.prisma.workspaceAiConfig.findUnique({
      where: { workspaceId },
    });

    if (!existing) {
      // Create with provided values
      const config = await this.prisma.workspaceAiConfig.create({
        data: {
          workspaceId,
          aiEnabled: dto.aiEnabled ?? false,
          aiLevel: (dto.aiLevel as WorkspaceAiLevel) ?? WorkspaceAiLevel.OFF,
          llmProvider: dto.llmProvider,
          llmModel: dto.llmModel,
          llmBaseUrl: dto.llmBaseUrl,
          embeddingProvider: dto.embeddingProvider,
          embeddingModel: dto.embeddingModel,
          temperature: dto.temperature,
          topP: dto.topP,
          maxTokens: dto.maxTokens,
          maxEntitiesPerProposal: dto.maxEntitiesPerProposal,
        },
      });
      return this.toResponse(config);
    }

    const data: Prisma.WorkspaceAiConfigUpdateInput = {};
    if (dto.aiEnabled !== undefined) data.aiEnabled = dto.aiEnabled;
    if (dto.aiLevel !== undefined) data.aiLevel = dto.aiLevel as WorkspaceAiLevel;
    if (dto.llmProvider !== undefined) data.llmProvider = dto.llmProvider;
    if (dto.llmModel !== undefined) data.llmModel = dto.llmModel;
    if (dto.llmBaseUrl !== undefined) data.llmBaseUrl = dto.llmBaseUrl;
    if (dto.embeddingProvider !== undefined) data.embeddingProvider = dto.embeddingProvider;
    if (dto.embeddingModel !== undefined) data.embeddingModel = dto.embeddingModel;
    if (dto.temperature !== undefined) data.temperature = dto.temperature;
    if (dto.topP !== undefined) data.topP = dto.topP;
    if (dto.maxTokens !== undefined) data.maxTokens = dto.maxTokens;
    if (dto.maxEntitiesPerProposal !== undefined)
      data.maxEntitiesPerProposal = dto.maxEntitiesPerProposal;

    const config = await this.prisma.workspaceAiConfig.update({
      where: { workspaceId },
      data,
    });

    return this.toResponse(config);
  }

  async getUsageSummary(
    workspaceId: string,
    from?: string,
    to?: string,
  ): Promise<AiUsageSummaryDto> {
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const aggregate = await this.prisma.aiUsageLog.aggregate({
      where: {
        workspaceId,
        createdAt: { gte: fromDate, lte: toDate },
      },
      _sum: {
        promptTokens: true,
        completionTokens: true,
        embeddingTokens: true,
        estimatedCostUsd: true,
      },
      _count: true,
    });

    return {
      workspaceId,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      totalPromptTokens: aggregate._sum.promptTokens ?? 0,
      totalCompletionTokens: aggregate._sum.completionTokens ?? 0,
      totalEmbeddingTokens: aggregate._sum.embeddingTokens ?? 0,
      estimatedCostUsd: Number(aggregate._sum.estimatedCostUsd ?? 0),
      requestCount: aggregate._count,
    };
  }

  private toResponse(config: {
    id: string;
    workspaceId: string;
    aiEnabled: boolean;
    aiLevel: string;
    llmProvider: string | null;
    llmModel: string | null;
    embeddingProvider: string | null;
    embeddingModel: string | null;
    temperature: Prisma.Decimal | null;
    maxEntitiesPerProposal: number | null;
    systemPromptVersion: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AiConfigResponseDto {
    return {
      id: config.id,
      workspaceId: config.workspaceId,
      aiEnabled: config.aiEnabled,
      aiLevel: config.aiLevel,
      llmProvider: config.llmProvider ?? undefined,
      llmModel: config.llmModel ?? undefined,
      embeddingProvider: config.embeddingProvider ?? undefined,
      embeddingModel: config.embeddingModel ?? undefined,
      temperature: config.temperature ? Number(config.temperature) : undefined,
      maxEntitiesPerProposal: config.maxEntitiesPerProposal ?? undefined,
      systemPromptVersion: config.systemPromptVersion ?? undefined,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  // ── Model Catalog ───────────────────────────────────────────────────

  getModelCatalog(): ModelCatalogResponseDto {
    return {
      catalogVersion: '2025-07-01',
      models: MODEL_CATALOG,
      featureGuides: FEATURE_GUIDES,
    };
  }
}

// ── Static catalog data ───────────────────────────────────────────────

const MODEL_CATALOG: ModelEntryDto[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────
  {
    provider: 'openai',
    modelId: 'gpt-4.1',
    displayName: 'GPT-4.1',
    tier: 'premium',
    costPer1MInput: 2.0,
    costPer1MOutput: 8.0,
    contextWindow: 1047576,
    qualityRating: 5,
    speedRating: 3,
    recommendedFor: ['proposals', 'briefs'],
    advice:
      'Modèle phare OpenAI. Excellent raisonnement et suivi d\'instructions. Idéal pour les propositions complexes et les rapports structurés. Coût élevé — à réserver aux tâches critiques.',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4.1-mini',
    displayName: 'GPT-4.1 Mini',
    tier: 'balanced',
    costPer1MInput: 0.4,
    costPer1MOutput: 1.6,
    contextWindow: 1047576,
    qualityRating: 4,
    speedRating: 4,
    recommendedFor: ['proposals', 'chat', 'summarization'],
    advice:
      'Meilleur rapport qualité/prix. Recommandé comme modèle par défaut pour la plupart des fonctionnalités. Raisonnement solide, réponses rapides.',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4.1-nano',
    displayName: 'GPT-4.1 Nano',
    tier: 'budget',
    costPer1MInput: 0.1,
    costPer1MOutput: 0.4,
    contextWindow: 1047576,
    qualityRating: 3,
    speedRating: 5,
    recommendedFor: ['chat'],
    advice:
      'Ultra-économique et très rapide. Parfait pour le chat conversationnel simple. Raisonnement limité — éviter pour les propositions complexes.',
  },
  {
    provider: 'openai',
    modelId: 'text-embedding-3-small',
    displayName: 'Embedding 3 Small',
    tier: 'budget',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    costPer1MEmbedding: 0.02,
    contextWindow: 8191,
    qualityRating: 3,
    speedRating: 5,
    recommendedFor: ['embeddings'],
    advice:
      'Embedding économique. Bon pour démarrer le RAG avec un budget limité. Qualité correcte pour la recherche sémantique.',
  },
  {
    provider: 'openai',
    modelId: 'text-embedding-3-large',
    displayName: 'Embedding 3 Large',
    tier: 'balanced',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    costPer1MEmbedding: 0.13,
    contextWindow: 8191,
    qualityRating: 5,
    speedRating: 4,
    recommendedFor: ['embeddings'],
    advice:
      'Embedding haute qualité. Recommandé pour une recherche sémantique précise. 6× plus cher que le small mais nettement meilleur en recall.',
  },

  // ── Anthropic ───────────────────────────────────────────────────────
  {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    tier: 'premium',
    costPer1MInput: 3.0,
    costPer1MOutput: 15.0,
    contextWindow: 200000,
    qualityRating: 5,
    speedRating: 3,
    recommendedFor: ['proposals', 'briefs', 'summarization'],
    advice:
      'Excellent en raisonnement et en rédaction structurée. Très bon pour les propositions et la synthèse de longs contextes. Fenêtre de 200k tokens.',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-3-5-20241022',
    displayName: 'Claude 3.5 Haiku',
    tier: 'budget',
    costPer1MInput: 0.8,
    costPer1MOutput: 4.0,
    contextWindow: 200000,
    qualityRating: 3,
    speedRating: 5,
    recommendedFor: ['chat', 'summarization'],
    advice:
      'Le plus rapide de la gamme Anthropic. Bon pour le chat et les résumés. Raisonnement en retrait par rapport à Sonnet.',
  },

  // ── Mistral ─────────────────────────────────────────────────────────
  {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large',
    tier: 'premium',
    costPer1MInput: 2.0,
    costPer1MOutput: 6.0,
    contextWindow: 128000,
    qualityRating: 4,
    speedRating: 3,
    recommendedFor: ['proposals', 'briefs'],
    advice:
      'Modèle phare Mistral. Bon en raisonnement, natif français. Alternative européenne aux modèles US pour les données sensibles.',
  },
  {
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    displayName: 'Mistral Small',
    tier: 'budget',
    costPer1MInput: 0.1,
    costPer1MOutput: 0.3,
    contextWindow: 32000,
    qualityRating: 3,
    speedRating: 5,
    recommendedFor: ['chat', 'summarization'],
    advice:
      'Très économique, hébergé en Europe (souveraineté des données). Bon pour le chat courant. Contexte limité à 32k.',
  },
  {
    provider: 'mistral',
    modelId: 'mistral-embed',
    displayName: 'Mistral Embed',
    tier: 'budget',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    costPer1MEmbedding: 0.1,
    contextWindow: 8192,
    qualityRating: 3,
    speedRating: 4,
    recommendedFor: ['embeddings'],
    advice:
      'Embedding Mistral. Alternative européenne pour le RAG. Données traitées en Europe.',
  },

  // ── Google Gemini ───────────────────────────────────────────────────
  {
    provider: 'gemini',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    tier: 'premium',
    costPer1MInput: 1.25,
    costPer1MOutput: 10.0,
    contextWindow: 1048576,
    qualityRating: 5,
    speedRating: 3,
    recommendedFor: ['proposals', 'briefs', 'summarization'],
    advice:
      'Fenêtre de contexte massive (1M tokens). Idéal pour l\'analyse de gros projets. Très bon raisonnement.',
  },
  {
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    tier: 'balanced',
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    contextWindow: 1048576,
    qualityRating: 4,
    speedRating: 5,
    recommendedFor: ['chat', 'summarization', 'proposals'],
    advice:
      'Excellent rapport qualité/prix avec une fenêtre de contexte de 1M tokens. Alternative très compétitive à GPT-4.1 Mini.',
  },

  // ── Ollama (local) ──────────────────────────────────────────────────
  {
    provider: 'ollama',
    modelId: 'llama3.3:70b',
    displayName: 'Llama 3.3 70B',
    tier: 'premium',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    contextWindow: 128000,
    qualityRating: 4,
    speedRating: 2,
    recommendedFor: ['proposals', 'briefs'],
    advice:
      'Gratuit, 100% local, données privées. Nécessite un GPU puissant (≥ 48 Go VRAM). Raisonnement solide.',
  },
  {
    provider: 'ollama',
    modelId: 'llama3.2:8b',
    displayName: 'Llama 3.2 8B',
    tier: 'budget',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    contextWindow: 128000,
    qualityRating: 2,
    speedRating: 4,
    recommendedFor: ['chat'],
    advice:
      'Petit modèle local, tourne sur CPU ou petit GPU. Pour le chat simple uniquement. Raisonnement limité.',
  },
  {
    provider: 'ollama',
    modelId: 'nomic-embed-text',
    displayName: 'Nomic Embed Text',
    tier: 'budget',
    costPer1MInput: 0,
    costPer1MOutput: 0,
    costPer1MEmbedding: 0,
    contextWindow: 8192,
    qualityRating: 3,
    speedRating: 4,
    recommendedFor: ['embeddings'],
    advice:
      'Embedding local gratuit. Bonne qualité pour le RAG. Aucune donnée envoyée à l\'extérieur.',
  },
];

const FEATURE_GUIDES: FeatureGuideDto[] = [
  {
    feature: 'proposals',
    label: 'Propositions IA',
    description:
      'Génère des propositions d\'actions sur vos tâches. Nécessite un modèle avec de bonnes capacités de raisonnement et de suivi d\'instructions structurées.',
    recommendedModelId: 'gpt-4.1-mini',
    requiredCapabilities: ['reasoning', 'structured-output', 'instruction-following'],
  },
  {
    feature: 'chat',
    label: 'Chat conversationnel',
    description:
      'Échanges interactifs avec l\'agent IA. Privilégiez un modèle rapide et économique, la qualité de raisonnement est moins critique.',
    recommendedModelId: 'gpt-4.1-nano',
    requiredCapabilities: ['low-latency', 'conversational'],
  },
  {
    feature: 'embeddings',
    label: 'Embeddings (RAG)',
    description:
      'Vectorisation du contenu pour la recherche sémantique. Modèle d\'embedding dédié requis. Le coût est proportionnel au volume de contenu indexé.',
    recommendedModelId: 'text-embedding-3-small',
    requiredCapabilities: ['embedding'],
  },
  {
    feature: 'summarization',
    label: 'Résumés et synthèses',
    description:
      'Résumé de tâches, boards et activité. Privilégiez une grande fenêtre de contexte et un bon rapport qualité/prix.',
    recommendedModelId: 'gpt-4.1-mini',
    requiredCapabilities: ['long-context', 'summarization'],
  },
  {
    feature: 'briefs',
    label: 'Rapports et briefs',
    description:
      'Génération de rapports structurés et détaillés. Nécessite un modèle premium avec un excellent suivi d\'instructions et une rédaction soignée.',
    recommendedModelId: 'gpt-4.1',
    requiredCapabilities: ['reasoning', 'structured-output', 'writing-quality'],
  },
];
