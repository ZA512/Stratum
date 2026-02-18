import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * AN-P0-06 — AgentContextBuilder
 *
 * Construit un contexte sûr et déterministe pour l'agent.
 * Politique: Live (DB canonique) > RAG en cas de divergence.
 *
 * Le contexte est assemblé à partir des données live DB,
 * enrichi par les données RAG si disponibles, avec détection
 * de divergence et marquage stale.
 */

export interface AgentContext {
  workspaceId: string;
  /** Données live depuis la DB canonique */
  live: {
    boards: BoardSummary[];
    recentActivity: ActivityEntry[];
  };
  /** Données RAG (si disponibles) — P1 */
  rag?: {
    available: boolean;
    stale: boolean;
    documents?: unknown[];
  };
  /** Métadonnées du contexte */
  meta: {
    builtAt: string;
    liveQueryMs: number;
    ragQueryMs?: number;
    divergenceDetected: boolean;
  };
}

export interface BoardSummary {
  id: string;
  name: string;
  columnsCount: number;
  nodesCount: number;
  updatedAt: string;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

@Injectable()
export class AgentContextBuilder {
  private readonly logger = new Logger('AgentContextBuilder');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construit le contexte complet pour un workspace.
   * Politique Live > RAG : les données live sont toujours prioritaires.
   */
  async build(workspaceId: string): Promise<AgentContext> {
    const startLive = Date.now();

    const [boards, recentActivity] = await Promise.all([
      this.fetchBoardSummaries(workspaceId),
      this.fetchRecentActivity(workspaceId),
    ]);

    const liveQueryMs = Date.now() - startLive;

    // P1: enrichir avec RAG si disponible
    const rag = await this.fetchRagContext(workspaceId);

    const divergenceDetected = rag?.available === true && rag.stale === true;

    if (divergenceDetected) {
      this.logger.warn(
        `Divergence RAG detectee pour workspace ${workspaceId} — live prevaut`,
      );
      // TODO P1: emettre job de rebuild RAG
    }

    return {
      workspaceId,
      live: { boards, recentActivity },
      rag,
      meta: {
        builtAt: new Date().toISOString(),
        liveQueryMs,
        ragQueryMs: rag?.available ? 0 : undefined,
        divergenceDetected,
      },
    };
  }

  private async fetchBoardSummaries(
    workspaceId: string,
  ): Promise<BoardSummary[]> {
    const board = await this.prisma.board.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        updatedAt: true,
        node: { select: { title: true } },
        columns: {
          select: {
            id: true,
            _count: { select: { nodes: true } },
          },
        },
      },
    });

    if (!board) return [];

    return [
      {
        id: board.id,
        name: board.node.title,
        columnsCount: board.columns.length,
        nodesCount: board.columns.reduce(
          (sum, col) => sum + col._count.nodes,
          0,
        ),
        updatedAt: board.updatedAt.toISOString(),
      },
    ];
  }

  private async fetchRecentActivity(
    workspaceId: string,
  ): Promise<ActivityEntry[]> {
    // Utiliser EventLog (modele agent-native) pour l'activite recente
    const events = await this.prisma.eventLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        eventType: true,
        entityType: true,
        entityId: true,
        createdAt: true,
      },
    });

    return events.map((e) => ({
      id: e.id,
      action: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  /**
   * Stub RAG — sera implémenté en P1.
   * Pour l'instant, retourne non-disponible.
   */
  private async fetchRagContext(
    _workspaceId: string,
  ): Promise<AgentContext['rag']> {
    return {
      available: false,
      stale: false,
    };
  }
}
