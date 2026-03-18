import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityType, MembershipStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EventLogService } from './event-log.service';
import {
  BoardActivityReportItemDto,
  BoardActivityReportResponseDto,
} from './dto/activity-report.dto';

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

export interface LogActivityOptions {
  skipCanonicalEvent?: boolean;
}

type BoardActivityReportQuery = {
  from?: string;
  to?: string;
  actorId?: string;
  eventTypes?: string[];
  query?: string;
  limit?: number;
};

@Injectable()
export class ActivityService {
  private readonly maxLogsPerNode: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventLogService: EventLogService,
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
    options?: LogActivityOptions,
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

      if (!options?.skipCanonicalEvent) {
        await this.eventLogService.logNodeEvent(
          {
            nodeId,
            actorId: userId,
            eventType: type,
            payload: metadata,
          },
          tx,
        );
      }

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

  async getBoardReport(
    boardId: string,
    userId: string,
    query: BoardActivityReportQuery,
  ): Promise<BoardActivityReportResponseDto> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        ownerUserId: true,
        isPersonal: true,
        node: {
          select: {
            id: true,
            title: true,
            path: true,
            teamId: true,
            workspaceId: true,
          },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    await this.ensureUserCanReadBoard(board, userId);

    const dateRange = this.resolveDateRange(query.from, query.to);
    const limit = Math.min(Math.max(query.limit ?? 400, 1), 2000);

    const subtreeBoards = await this.prisma.board.findMany({
      where: {
        node: {
          workspaceId: board.node.workspaceId,
          path: {
            startsWith: board.node.path,
          },
        },
      },
      select: {
        id: true,
        node: {
          select: {
            title: true,
          },
        },
      },
    });

    const boardNameById = new Map(
      subtreeBoards.map((entry) => [entry.id, entry.node.title]),
    );
    const boardIds = new Set(subtreeBoards.map((entry) => entry.id));

    const events = await this.prisma.eventLog.findMany({
      where: {
        workspaceId: board.node.workspaceId,
        boardId: { in: Array.from(boardIds) },
        createdAt: {
          gte: dateRange.from,
          lte: dateRange.to,
        },
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.eventTypes && query.eventTypes.length > 0
          ? { eventType: { in: query.eventTypes } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(limit * 4, limit),
      select: {
        id: true,
        actorId: true,
        boardId: true,
        eventType: true,
        payload: true,
        createdAt: true,
      },
    });

    const actorIds = Array.from(
      new Set(
        events
          .map((event) => event.actorId)
          .filter((actorId): actorId is string => Boolean(actorId)),
      ),
    );

    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, email: true, avatarUrl: true },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    const normalizedQuery = query.query?.trim().toLowerCase() ?? '';

    const items: BoardActivityReportItemDto[] = [];
    for (const event of events) {
      const payload = this.normalizeRecord(event.payload);
      const nodePayload = this.normalizeRecord(payload?.node);
      const changePayload = this.normalizeRecord(payload?.change);
      const eventBoardId = event.boardId;
      if (!eventBoardId || !boardIds.has(eventBoardId)) {
        continue;
      }

      const summary =
        typeof payload?.summary === 'string' && payload.summary.trim()
          ? payload.summary.trim()
          : event.eventType;
      const nodeTitle =
        typeof nodePayload?.title === 'string' && nodePayload.title.trim()
          ? nodePayload.title.trim()
          : 'Sans titre';
      const commentBody =
        typeof changePayload?.body === 'string' ? changePayload.body : null;
      const commentPreview =
        typeof changePayload?.bodyPreview === 'string'
          ? changePayload.bodyPreview
          : commentBody;
      const oldValue = this.stringifyReportValue(changePayload?.oldValue);
      const newValue = this.stringifyReportValue(changePayload?.newValue);

      if (normalizedQuery) {
        const haystack = [
          summary,
          nodeTitle,
          commentBody ?? '',
          oldValue ?? '',
          newValue ?? '',
          event.eventType,
          boardNameById.get(eventBoardId) ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) {
          continue;
        }
      }

      const actor = event.actorId ? userById.get(event.actorId) : null;
      items.push({
        id: event.id,
        createdAt: event.createdAt.toISOString(),
        eventType: event.eventType,
        summary,
        actorId: event.actorId,
        actorDisplayName:
          actor?.displayName?.trim() || actor?.email?.trim() || event.actorId,
        actorAvatarUrl: actor?.avatarUrl ?? null,
        boardId: eventBoardId,
        boardName: boardNameById.get(eventBoardId) ?? board.node.title,
        nodeId:
          typeof nodePayload?.id === 'string' ? nodePayload.id : event.eventType,
        nodeShortId:
          typeof nodePayload?.shortId === 'number' ? nodePayload.shortId : null,
        nodeTitle,
        parentNodeId:
          typeof nodePayload?.parentId === 'string' ? nodePayload.parentId : null,
        columnId:
          typeof nodePayload?.columnId === 'string' ? nodePayload.columnId : null,
        columnName:
          typeof nodePayload?.columnName === 'string'
            ? nodePayload.columnName
            : null,
        fieldKey:
          typeof changePayload?.fieldKey === 'string' ? changePayload.fieldKey : null,
        oldValue,
        newValue,
        commentBody,
        commentPreview,
        payload: changePayload,
      });

      if (items.length >= limit) {
        break;
      }
    }

    return {
      boardId: board.id,
      boardName: board.node.title,
      from: dateRange.from.toISOString(),
      to: dateRange.to.toISOString(),
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: items.length,
        cardsCreated: items.filter((item) => item.eventType === 'NODE_CREATED').length,
        cardsMoved: items.filter((item) =>
          ['NODE_MOVED', 'KANBAN_MOVED', 'MOVED_TO_BOARD'].includes(item.eventType),
        ).length,
        commentsAdded: items.filter((item) => item.eventType === 'COMMENT_ADDED').length,
        descriptionsUpdated: items.filter((item) => item.eventType === 'DESCRIPTION_UPDATED').length,
        dueDatesUpdated: items.filter((item) => item.eventType === 'DUE_DATE_UPDATED').length,
        progressUpdated: items.filter((item) => item.eventType === 'PROGRESS_UPDATED').length,
        cardsArchived: items.filter((item) =>
          ['NODE_ARCHIVED', 'KANBAN_SOFT_DELETED'].includes(item.eventType),
        ).length,
        cardsRestored: items.filter((item) =>
          ['NODE_RESTORED', 'KANBAN_RESTORED'].includes(item.eventType),
        ).length,
      },
      items,
    };
  }

  private resolveDateRange(fromRaw?: string, toRaw?: string): { from: Date; to: Date } {
    const now = new Date();
    const to = this.parseDateBoundary(toRaw, 'end') ?? now;
    const from =
      this.parseDateBoundary(fromRaw, 'start') ??
      new Date(to.getTime() - 6 * 24 * 60 * 60 * 1000);
    return {
      from,
      to,
    };
  }

  private parseDateBoundary(
    raw: string | undefined,
    boundary: 'start' | 'end',
  ): Date | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(
        `${trimmed}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`,
      );
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  private normalizeRecord(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private stringifyReportValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  private async ensureUserCanReadBoard(
    board: {
      id: string;
      ownerUserId: string | null;
      isPersonal: boolean;
      node: { teamId: string; workspaceId: string };
    },
    userId: string,
  ): Promise<void> {
    if (board.ownerUserId) {
      if (board.ownerUserId !== userId) {
        throw new ForbiddenException(
          'Vous ne pouvez pas lire ce workspace personnel',
        );
      }
      return;
    }

    const membership = await this.prisma.membership.findFirst({
      where: {
        teamId: board.node.teamId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        "Vous n'avez pas la permission de lire ce board",
      );
    }
  }
}
