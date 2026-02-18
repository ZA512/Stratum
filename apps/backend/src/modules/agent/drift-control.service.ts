import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PromptGovernanceService } from './prompt-governance.service';

export interface DriftReport {
  currentVersion: string;
  sampleSize: number;
  currentErrorRate: number;
  previousErrorRate: number;
  degraded: boolean;
  autoRolledBack: boolean;
  rolledBackTo: string | null;
}

const ERROR_RATE_THRESHOLD = 0.15;
const MIN_SAMPLE_SIZE = 10;

/**
 * AN-P1-07 — Drift control automatique.
 *
 * Compare les taux d'erreur entre la version N et N-1 du prompt.
 * Si degradation > seuil, rollback automatique + alerte.
 */
@Injectable()
export class DriftControlService {
  private readonly logger = new Logger('DriftControl');

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptGovernance: PromptGovernanceService,
  ) {}

  /**
   * Evaluer la drift pour un workspace.
   * Compare error rate de la version courante vs precedente.
   */
  async evaluate(
    workspaceId: string,
    autoRollback = true,
  ): Promise<DriftReport> {
    const { version: currentVersion } =
      await this.promptGovernance.getActivePrompt(workspaceId);

    // Events agent recents (dernieres 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Compter erreurs et total pour la version courante
    const recentEvents = await this.prisma.eventLog.findMany({
      where: {
        workspaceId,
        source: 'AGENT',
        createdAt: { gte: since },
        eventType: {
          in: [
            'AGENT_COMMAND_DRAFT_CREATED',
            'AGENT_CHAT_RESPONSE_GENERATED',
            'AGENT_COMMAND_ERROR',
            'AGENT_CHAT_ERROR',
          ],
        },
      },
      select: { eventType: true },
    });

    const totalCurrent = recentEvents.length;
    const errorsCurrent = recentEvents.filter(
      (e) => e.eventType.includes('ERROR'),
    ).length;
    const currentErrorRate =
      totalCurrent > 0 ? errorsCurrent / totalCurrent : 0;

    // Chercher la version precedente via l'historique des activations
    const lastActivation = await this.prisma.eventLog.findFirst({
      where: {
        workspaceId,
        eventType: 'PROMPT_VERSION_ACTIVATED',
      },
      orderBy: { createdAt: 'desc' },
      select: { payload: true, createdAt: true },
    });

    let previousErrorRate = 0;
    if (lastActivation) {
      const activationDate = lastActivation.createdAt;
      const beforeActivation = new Date(
        activationDate.getTime() - 24 * 60 * 60 * 1000,
      );

      const previousEvents = await this.prisma.eventLog.findMany({
        where: {
          workspaceId,
          source: 'AGENT',
          createdAt: { gte: beforeActivation, lt: activationDate },
          eventType: {
            in: [
              'AGENT_COMMAND_DRAFT_CREATED',
              'AGENT_CHAT_RESPONSE_GENERATED',
              'AGENT_COMMAND_ERROR',
              'AGENT_CHAT_ERROR',
            ],
          },
        },
        select: { eventType: true },
      });

      const totalPrevious = previousEvents.length;
      const errorsPrevious = previousEvents.filter(
        (e) => e.eventType.includes('ERROR'),
      ).length;
      previousErrorRate =
        totalPrevious > 0 ? errorsPrevious / totalPrevious : 0;
    }

    const degraded =
      totalCurrent >= MIN_SAMPLE_SIZE &&
      currentErrorRate > previousErrorRate + ERROR_RATE_THRESHOLD;

    let autoRolledBack = false;
    let rolledBackTo: string | null = null;

    if (degraded && autoRollback) {
      try {
        rolledBackTo = await this.promptGovernance.rollback(
          workspaceId,
          'SYSTEM',
        );
        autoRolledBack = true;
        this.logger.warn(
          `Drift detected workspace ${workspaceId}: ${currentVersion} error rate ${(currentErrorRate * 100).toFixed(1)}% vs previous ${(previousErrorRate * 100).toFixed(1)}%. Auto-rolled back to ${rolledBackTo}`,
        );
      } catch {
        this.logger.error(
          `Drift detected but rollback failed for workspace ${workspaceId}`,
        );
      }
    }

    return {
      currentVersion,
      sampleSize: totalCurrent,
      currentErrorRate:
        Math.round(currentErrorRate * 1000) / 1000,
      previousErrorRate:
        Math.round(previousErrorRate * 1000) / 1000,
      degraded,
      autoRolledBack,
      rolledBackTo,
    };
  }
}
