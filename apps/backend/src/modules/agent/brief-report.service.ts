import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface MorningBrief {
  workspaceId: string;
  generatedAt: string;
  period: { from: string; to: string };
  summary: {
    totalEvents: number;
    proposalsCreated: number;
    proposalsApplied: number;
    proposalsRejected: number;
    agentCommands: number;
    agentChats: number;
  };
  highlights: string[];
  actionItems: string[];
}

export interface WeeklyReport {
  workspaceId: string;
  generatedAt: string;
  period: { from: string; to: string };
  summary: {
    totalEvents: number;
    proposalsCreated: number;
    proposalsApplied: number;
    proposalsRejected: number;
    proposalsRolledBack: number;
    agentCommands: number;
    agentChats: number;
    avgConfidence: number;
  };
  topEntities: Array<{
    entityType: string;
    entityId: string;
    eventCount: number;
  }>;
  trends: {
    dailyActivity: Array<{ date: string; events: number }>;
  };
}

/**
 * AN-P1-12 — Morning brief + reporting hebdo.
 *
 * Brief quotidien: resume des 24 dernieres heures d'activite agent.
 * Rapport hebdo: resume des 7 derniers jours avec tendances.
 *
 * Base sur les donnees de `EventLog`.
 */
@Injectable()
export class BriefReportService {
  private readonly logger = new Logger('BriefReport');

  constructor(private readonly prisma: PrismaService) {}

  /** Brief des dernieres 24h */
  async getMorningBrief(workspaceId: string): Promise<MorningBrief> {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const events = await this.prisma.eventLog.findMany({
      where: {
        workspaceId,
        createdAt: { gte: since },
      },
      select: { eventType: true, entityType: true, entityId: true },
    });

    const proposalsCreated = events.filter(
      (e) => e.eventType === 'AGENT_COMMAND_DRAFT_CREATED',
    ).length;
    const proposalsApplied = events.filter(
      (e) => e.eventType === 'PROPOSAL_APPLIED',
    ).length;
    const proposalsRejected = events.filter(
      (e) => e.eventType === 'PROPOSAL_REJECTED',
    ).length;
    const agentCommands = events.filter(
      (e) => e.eventType.startsWith('AGENT_COMMAND'),
    ).length;
    const agentChats = events.filter(
      (e) => e.eventType.startsWith('AGENT_CHAT'),
    ).length;

    const highlights: string[] = [];
    if (proposalsApplied > 0) {
      highlights.push(`${proposalsApplied} proposal(s) appliquee(s)`);
    }
    if (proposalsRejected > 0) {
      highlights.push(`${proposalsRejected} proposal(s) rejetee(s)`);
    }
    if (agentCommands > 0) {
      highlights.push(`${agentCommands} commande(s) agent`);
    }
    if (agentChats > 0) {
      highlights.push(`${agentChats} session(s) de chat`);
    }
    if (events.length === 0) {
      highlights.push('Aucune activite agent dans les dernieres 24h');
    }

    const actionItems: string[] = [];
    const pendingProposals = await this.prisma.proposal.count({
      where: {
        workspaceId,
        status: { in: ['DRAFT', 'VALIDATED'] },
      },
    });
    if (pendingProposals > 0) {
      actionItems.push(
        `${pendingProposals} proposal(s) en attente de review`,
      );
    }

    return {
      workspaceId,
      generatedAt: now.toISOString(),
      period: { from: since.toISOString(), to: now.toISOString() },
      summary: {
        totalEvents: events.length,
        proposalsCreated,
        proposalsApplied,
        proposalsRejected,
        agentCommands,
        agentChats,
      },
      highlights,
      actionItems,
    };
  }

  /** Rapport des 7 derniers jours */
  async getWeeklyReport(workspaceId: string): Promise<WeeklyReport> {
    const now = new Date();
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const events = await this.prisma.eventLog.findMany({
      where: {
        workspaceId,
        createdAt: { gte: since },
      },
      select: {
        eventType: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    const proposalsCreated = events.filter(
      (e) => e.eventType === 'AGENT_COMMAND_DRAFT_CREATED',
    ).length;
    const proposalsApplied = events.filter(
      (e) => e.eventType === 'PROPOSAL_APPLIED',
    ).length;
    const proposalsRejected = events.filter(
      (e) => e.eventType === 'PROPOSAL_REJECTED',
    ).length;
    const proposalsRolledBack = events.filter(
      (e) => e.eventType === 'PROPOSAL_ROLLED_BACK',
    ).length;
    const agentCommands = events.filter(
      (e) => e.eventType.startsWith('AGENT_COMMAND'),
    ).length;
    const agentChats = events.filter(
      (e) => e.eventType.startsWith('AGENT_CHAT'),
    ).length;

    // Confidence moyenne des proposals de la semaine
    const proposals = await this.prisma.proposal.findMany({
      where: {
        workspaceId,
        createdAt: { gte: since },
        confidenceScore: { not: null },
      },
      select: { confidenceScore: true },
    });

    const avgConfidence =
      proposals.length > 0
        ? proposals.reduce(
            (sum, p) => sum + Number(p.confidenceScore),
            0,
          ) / proposals.length
        : 0;

    // Top entites impactees
    const entityCounts = new Map<string, number>();
    for (const e of events) {
      const key = `${e.entityType}:${e.entityId}`;
      entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
    }

    const topEntities = Array.from(entityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [entityType, entityId] = key.split(':');
        return { entityType, entityId, eventCount: count };
      });

    // Activite par jour
    const dailyMap = new Map<string, number>();
    for (const e of events) {
      const day = e.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }
    const dailyActivity = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, evts]) => ({ date, events: evts }));

    return {
      workspaceId,
      generatedAt: now.toISOString(),
      period: { from: since.toISOString(), to: now.toISOString() },
      summary: {
        totalEvents: events.length,
        proposalsCreated,
        proposalsApplied,
        proposalsRejected,
        proposalsRolledBack,
        agentCommands,
        agentChats,
        avgConfidence: Math.round(avgConfidence * 1000) / 1000,
      },
      topEntities,
      trends: { dailyActivity },
    };
  }
}
