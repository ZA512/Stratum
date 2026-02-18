import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** Coûts connus par 1M tokens (approximation, configurable) */
const DEFAULT_COSTS_PER_MILLION: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
  'text-embedding-ada-002': 0.10,
};
const DEFAULT_COST_PER_MILLION = 0.10;
const BUDGET_ALERT_THRESHOLD = 0.8;

export interface CostProjection {
  currentMonthTokens: number;
  currentMonthCostUsd: number;
  projectedMonthCostUsd: number;
  budgetUsd: number | null;
  budgetUsedPercent: number | null;
  alertTriggered: boolean;
  rebuildEstimateCostUsd: number;
}

/**
 * AN-P1-05 — Projection et alerte coûts embedding.
 *
 * - Calcul coût mensuel courant depuis `AiUsageLog`
 * - Projection fin de mois
 * - Estimation coût rebuild (depuis stats RAG)
 * - Alerte seuil 80% budget workspace
 */
@Injectable()
export class EmbeddingCostService {
  private readonly logger = new Logger('EmbeddingCost');

  constructor(private readonly prisma: PrismaService) {}

  async getProjection(workspaceId: string): Promise<CostProjection> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    // Usage courant ce mois
    const usageLogs = await this.prisma.aiUsageLog.findMany({
      where: {
        workspaceId,
        createdAt: { gte: monthStart },
      },
      select: {
        embeddingTokens: true,
        estimatedCostUsd: true,
        model: true,
      },
    });

    let currentMonthTokens = 0;
    let currentMonthCostUsd = 0;

    for (const log of usageLogs) {
      currentMonthTokens += log.embeddingTokens;
      if (log.estimatedCostUsd) {
        currentMonthCostUsd += Number(log.estimatedCostUsd);
      } else {
        // Estimer depuis les tokens
        const costPerMillion =
          DEFAULT_COSTS_PER_MILLION[log.model] ?? DEFAULT_COST_PER_MILLION;
        currentMonthCostUsd += (log.embeddingTokens / 1_000_000) * costPerMillion;
      }
    }

    // Projection fin de mois (extrapolation linéaire)
    const projectedMonthCostUsd =
      dayOfMonth > 0
        ? (currentMonthCostUsd / dayOfMonth) * daysInMonth
        : 0;

    // Budget workspace
    const quota = await this.prisma.workspaceAiQuota.findUnique({
      where: { workspaceId },
      select: { monthlyEmbeddingBudget: true },
    });

    const budgetTokens = quota?.monthlyEmbeddingBudget
      ? Number(quota.monthlyEmbeddingBudget)
      : null;

    const budgetUsd = budgetTokens
      ? (budgetTokens / 1_000_000) * DEFAULT_COST_PER_MILLION
      : null;

    const budgetUsedPercent =
      budgetUsd && budgetUsd > 0
        ? currentMonthCostUsd / budgetUsd
        : null;

    const alertTriggered =
      budgetUsedPercent !== null && budgetUsedPercent >= BUDGET_ALERT_THRESHOLD;

    if (alertTriggered) {
      this.logger.warn(
        `Workspace ${workspaceId}: embedding budget at ${(budgetUsedPercent! * 100).toFixed(1)}%`,
      );
    }

    // Estimation coût rebuild
    const totalChunks = await this.prisma.ragChunk.count({
      where: { document: { workspaceId } },
    });
    // Estimation: ~100 tokens par chunk en moyenne
    const rebuildTokens = totalChunks * 100;
    const rebuildEstimateCostUsd =
      (rebuildTokens / 1_000_000) * DEFAULT_COST_PER_MILLION;

    return {
      currentMonthTokens,
      currentMonthCostUsd: Math.round(currentMonthCostUsd * 1_000_000) / 1_000_000,
      projectedMonthCostUsd:
        Math.round(projectedMonthCostUsd * 1_000_000) / 1_000_000,
      budgetUsd,
      budgetUsedPercent:
        budgetUsedPercent !== null
          ? Math.round(budgetUsedPercent * 1000) / 1000
          : null,
      alertTriggered,
      rebuildEstimateCostUsd:
        Math.round(rebuildEstimateCostUsd * 1_000_000) / 1_000_000,
    };
  }
}
