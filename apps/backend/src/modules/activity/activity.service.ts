import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

export interface ActivityLogEntry {
  id: string;
  nodeId: string;
  nodeShortId: number | null;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  type: ActivityType;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

@Injectable()
export class ActivityService {
  private readonly maxLogsPerNode: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Paramètre configurable via .env, défaut 20
    this.maxLogsPerNode = parseInt(
      this.config.get<string>('MAX_ACTIVITY_LOGS_PER_NODE', '20'),
      10,
    );
  }

  /**
   * Enregistre une activité et maintient la limite de logs par tâche
   */
  async logActivity(
    nodeId: string,
    userId: string,
    type: ActivityType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Créer le nouveau log
      await tx.activityLog.create({
        data: {
          nodeId,
          userId,
          type,
          metadata: metadata ? (metadata as never) : undefined,
        },
      });

      // Compter les logs pour cette tâche
      const count = await tx.activityLog.count({
        where: { nodeId },
      });

      // Si on dépasse la limite, supprimer les plus anciens
      if (count > this.maxLogsPerNode) {
        const toDelete = count - this.maxLogsPerNode;

        // Récupérer les IDs des logs les plus anciens à supprimer
        const oldLogs = await tx.activityLog.findMany({
          where: { nodeId },
          orderBy: { createdAt: 'asc' },
          take: toDelete,
          select: { id: true },
        });

        const idsToDelete = oldLogs.map((log) => log.id);

        await tx.activityLog.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }
    });
  }

  /**
   * Récupère les logs d'activité pour toutes les tâches d'un board
   */
  async getBoardActivity(
    boardId: string,
    limit = 100,
  ): Promise<ActivityLogEntry[]> {
    // Récupérer tous les nodeIds du board
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          include: {
            nodes: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!board) {
      return [];
    }

    const nodeIds = board.columns.flatMap((col) =>
      col.nodes.map((node) => node.id),
    );

    if (nodeIds.length === 0) {
      return [];
    }

    // Récupérer les logs pour ces tâches
    const logs = await this.prisma.activityLog.findMany({
      where: {
        nodeId: { in: nodeIds },
      },
      include: {
        user: {
          select: {
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
        node: {
          select: {
            shortId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      nodeId: log.nodeId,
      nodeShortId: log.node.shortId,
      userId: log.userId,
      userDisplayName: log.user.displayName,
      userEmail: log.user.email,
      userAvatarUrl: log.user.avatarUrl,
      type: log.type,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  /**
   * Récupère les logs d'activité pour une tâche spécifique
   */
  async getNodeActivity(nodeId: string): Promise<ActivityLogEntry[]> {
    const logs = await this.prisma.activityLog.findMany({
      where: { nodeId },
      include: {
        user: {
          select: {
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
        node: {
          select: {
            shortId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) => ({
      id: log.id,
      nodeId: log.nodeId,
      nodeShortId: log.node.shortId,
      userId: log.userId,
      userDisplayName: log.user.displayName,
      userEmail: log.user.email,
      userAvatarUrl: log.user.avatarUrl,
      type: log.type,
      metadata: log.metadata as Record<string, unknown> | null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  /**
   * Compte les logs d'aujourd'hui pour un board
   */
  async getTodayActivityCount(boardId: string): Promise<number> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          include: {
            nodes: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!board) {
      return 0;
    }

    const nodeIds = board.columns.flatMap((col) =>
      col.nodes.map((node) => node.id),
    );

    if (nodeIds.length === 0) {
      return 0;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.prisma.activityLog.count({
      where: {
        nodeId: { in: nodeIds },
        createdAt: { gte: startOfDay },
      },
    });
  }
}
