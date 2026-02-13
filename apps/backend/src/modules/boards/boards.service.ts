import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ColumnBehaviorKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardColumnDto } from './dto/board-column.dto';
import { BoardDto } from './dto/board.dto';
import {
  BoardGanttDependencyDto,
  BoardWithNodesDto,
} from './dto/board-with-nodes.dto';
import { BoardNodeDto } from './dto/board-node.dto';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';
import { ArchivedBoardNodeDto } from './dto/archived-board-node.dto';

const COLUMN_BEHAVIOR_DEFAULTS: Record<
  ColumnBehaviorKey,
  { label: string; color: string | null }
> = {
  [ColumnBehaviorKey.BACKLOG]: { label: 'Backlog', color: '#6b7280' },
  [ColumnBehaviorKey.IN_PROGRESS]: { label: 'En cours', color: '#2563eb' },
  [ColumnBehaviorKey.BLOCKED]: { label: 'Bloque', color: '#f97316' },
  [ColumnBehaviorKey.DONE]: { label: 'Termine', color: '#16a34a' },
  [ColumnBehaviorKey.CUSTOM]: { label: 'Custom', color: '#6366f1' },
};

const DEFAULT_BACKLOG_SETTINGS = Object.freeze({
  reviewAfterDays: 14,
  reviewEveryDays: 7,
  archiveAfterDays: 60,
});

const DEFAULT_DONE_SETTINGS = Object.freeze({
  archiveAfterDays: 30,
});

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type BacklogColumnSettings = {
  reviewAfterDays: number;
  reviewEveryDays: number;
  archiveAfterDays: number;
};

type DoneColumnSettings = {
  archiveAfterDays: number;
};

type JsonPayload = Record<string, unknown> | null;

type ColumnUpdatePayload = {
  name?: string;
  position?: number;
  wipLimit?: number | null;
  settings?: JsonPayload;
};

const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toIsoDateTime = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }
  return null;
};

type ParsedWorkflowSnapshot = {
  backlogHiddenUntil: string | null;
  backlogNextReviewAt: string | null;
  backlogReviewStartedAt: string | null;
  backlogLastInteractionAt: string | null;
  backlogLastReminderAt: string | null;
  lastKnownColumnId: string | null;
  lastKnownBehavior: ColumnBehaviorKey | null;
  doneArchiveScheduledAt: string | null;
};

type DueSummaryOptions = {
  rangeDays: number;
  includeDone: boolean;
};

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Diagnostic interne: retourne les flags de propriété d'un board sans appliquer restrictions.
   * A n'exposer qu'en environnement dev via le controller si nécessaire.
   */
  async diagnosticFlags(boardId: string): Promise<{
    boardId: string;
    ownerUserId: string | null;
    isPersonal: boolean;
  }> {
    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
    });
    if (!board) {
      throw new NotFoundException('Board introuvable');
    }
    return {
      boardId: board.id,
      ownerUserId: board.ownerUserId ?? null,
      isPersonal: board.isPersonal ?? false,
    };
  }

  async getBoard(boardId: string, _userId?: string): Promise<BoardDto> {
    void _userId;
    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: {
            id: true,
            title: true,
          },
        },
        columns: {
          include: { behavior: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!board) {
      throw new NotFoundException();
    }

    // Auto-réparation: persister les settings par défaut si absents.
    await this.repairMissingColumnSettings(board.columns);

    const b: any = board;
    return {
      id: b.id,
      nodeId: b.nodeId,
      name: b.node.title,
      columns: b.columns.map((column: any) => ({
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: this.normalizeColumnSettings(column.settings ?? null),
      })),
      ownerUserId: b.ownerUserId ?? null,
      isPersonal: b.isPersonal ?? false,
    };
  }

  async getBoardWithNodes(
    boardId: string,
    userId?: string,
  ): Promise<BoardWithNodesDto> {
    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: {
            id: true,
            title: true,
            teamId: true,
          },
        },
        columns: {
          include: {
            behavior: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!board) {
      throw new NotFoundException();
    }

    // Auto-réparation: persister les settings par défaut si absents.
    await this.repairMissingColumnSettings(board.columns);

    // Préparation typée plutôt que cast any pour éviter retours unsafe
    const columnIds = board.columns.map((column) => column.id);

    // Charger les placements personnalisés de tâches partagées pour cet utilisateur
    let sharedPlacements: Array<{
      nodeId: string;
      columnId: string;
      position: number;
      archivedAt: Date | null;
      node: any;
    }> = [];

    if (userId) {
      sharedPlacements = await prisma.sharedNodePlacement.findMany({
        where: {
          userId,
          columnId: { in: columnIds },
        },
        include: {
          node: {
            select: {
              id: true,
              title: true,
              columnId: true,
              position: true,
              parentId: true,
              path: true,
              dueAt: true,
              updatedAt: true,
              shortId: true,
              description: true,
              effort: true,
              priority: true,
              blockedReminderIntervalDays: true,
              blockedExpectedUnblockAt: true,
              blockedSince: true,
              tags: true,
              metadata: true,
              statusMetadata: true,
              progress: true,
              teamId: true,
              archivedAt: true,
              createdById: true,
              assignments: {
                select: {
                  role: true,
                  user: {
                    select: {
                      id: true,
                      displayName: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    // Charger les tâches appartenant directement au board
    const rawNodes = await prisma.node.findMany({
      where: {
        archivedAt: null,
        columnId: { in: columnIds },
      },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        columnId: true,
        position: true,
        parentId: true,
        dueAt: true,
        updatedAt: true,
        shortId: true,
        description: true,
        effort: true,
        priority: true,
        blockedReminderIntervalDays: true,
        blockedExpectedUnblockAt: true,
        blockedSince: true,
        tags: true,
        metadata: true,
        statusMetadata: true,
        progress: true,
        teamId: true,
        createdById: true,
        assignments: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Fusionner les tâches du board avec les tâches partagées placées
    const sharedNodeIds = new Set(sharedPlacements.map((p) => p.nodeId));
    const allNodesMap = new Map<string, any>();

    // IMPORTANT: Si c'est un board personnel d'un autre utilisateur,
    // on ne charge QUE les tâches avec SharedNodePlacement
    const isOtherPersonalBoard =
      board.isPersonal &&
      userId &&
      board.ownerUserId &&
      board.ownerUserId !== userId;

    if (isOtherPersonalBoard) {
      // Sur le board personnel d'Alice, Bob ne voit QUE les tâches avec placement
      console.log(
        '[boards.getBoardWithNodes] Loading other user personal board - showing only shared placements',
        {
          userId,
          boardOwnerId: board.ownerUserId,
          sharedPlacementsCount: sharedPlacements.length,
        },
      );
    } else {
      // Sur son propre board, l'utilisateur voit toutes les tâches du board
      // (sauf celles qui ont un placement personnalisé, qui seront ajoutées après)
      for (const node of rawNodes) {
        // Si la tâche est partagée avec l'utilisateur, on utilisera son placement personnel
        const isShared =
          userId && node.metadata
            ? (() => {
                try {
                  const meta = node.metadata;
                  const collaborators = meta?.share?.collaborators;
                  return (
                    Array.isArray(collaborators) &&
                    collaborators.some((c: any) => c.userId === userId)
                  );
                } catch {
                  return false;
                }
              })()
            : false;

        if (!isShared || !sharedNodeIds.has(node.id)) {
          allNodesMap.set(node.id, node);
        }
      }
    }

    const sharedPlacementNodeIds = new Set(
      sharedPlacements
        .filter((placement) => !placement.archivedAt)
        .map((placement) => placement.nodeId),
    );
    const lockedSharedPlacements = new Set<string>();

    for (const placement of sharedPlacements) {
      const nodePath = placement.node?.path ?? '';
      if (!nodePath) continue;
      const ancestors = nodePath.split('/').filter(Boolean).slice(0, -1);
      if (
        ancestors.some((ancestorId) => sharedPlacementNodeIds.has(ancestorId))
      ) {
        lockedSharedPlacements.add(placement.nodeId);
      }
    }

    // Ajouter les tâches partagées avec leur placement personnel (en écrasant position et columnId)
    for (const placement of sharedPlacements) {
      if (placement.archivedAt) continue;
      if (placement.node && !placement.node.archivedAt) {
        allNodesMap.set(placement.nodeId, {
          ...placement.node,
          columnId: placement.columnId, // Position personnalisée de l'utilisateur
          position: placement.position,
          isSharedRoot: true, // Flag pour identifier les tâches mères partagées
          sharedPlacementLocked: lockedSharedPlacements.has(placement.nodeId),
        });
      }
    }

    const filteredNodes = Array.from(allNodesMap.values());

    const behaviorByColumn = new Map<string, ColumnBehaviorKey>();
    for (const column of board.columns) {
      behaviorByColumn.set(column.id, column.behavior.key);
    }

    // Récupérer les IDs des nodes qui ont des partages avec d'autres utilisateurs
    const nodeIdsWithSharing = new Set<string>();
    if (userId && filteredNodes.length > 0) {
      const nodeIds = filteredNodes.map((n) => n.id as string);
      const sharingPlacements = await prisma.sharedNodePlacement.findMany({
        where: {
          nodeId: { in: nodeIds },
          userId: { not: userId }, // Partages avec d'AUTRES utilisateurs
        },
        select: { nodeId: true },
        distinct: ['nodeId'],
      });
      for (const placement of sharingPlacements) {
        nodeIdsWithSharing.add(placement.nodeId);
      }
    }

    const workflowByNode = new Map<string, ParsedWorkflowSnapshot>();
    const snoozedCounts = new Map<string, number>();
    const nodes = [] as typeof filteredNodes;
    const nowMs = Date.now();
    const ganttDependencies: BoardGanttDependencyDto[] = [];

    for (const node of filteredNodes) {
      const workflow = this.parseWorkflowMetadata(node.metadata ?? null);
      workflowByNode.set(node.id, workflow);
      const behavior = node.columnId
        ? behaviorByColumn.get(node.columnId)
        : null;
      // Marquer les nodes snoozées au lieu de les filtrer
      let isSnoozed = false;
      if (
        behavior === ColumnBehaviorKey.BACKLOG &&
        workflow.backlogHiddenUntil &&
        node.columnId
      ) {
        const hiddenTs = Date.parse(workflow.backlogHiddenUntil);
        if (!Number.isNaN(hiddenTs) && hiddenTs > nowMs) {
          isSnoozed = true;
          snoozedCounts.set(
            node.columnId,
            (snoozedCounts.get(node.columnId) ?? 0) + 1,
          );
        }
      }
      nodes.push({ ...node, isSnoozed });
    }

    const recentCommentNodeIds = new Set<string>();
    if (nodes.length > 0) {
      const since = new Date(nowMs - DAY_IN_MS);
      const recentComments = await prisma.comment.findMany({
        where: {
          nodeId: { in: nodes.map((node) => node.id as string) },
          createdAt: { gte: since },
        },
        select: { nodeId: true },
        distinct: ['nodeId'],
      });
      for (const comment of recentComments) {
        recentCommentNodeIds.add(comment.nodeId);
      }
    }

    // Pré-calculer les counts des enfants par carte (parentId = id de la carte)
    const countsByParent = new Map<
      string,
      { backlog: number; inProgress: number; blocked: number; done: number }
    >();
    if (nodes.length > 0) {
      const nodeIds = nodes.map((n) => n.id as string);
      const children = await prisma.node.findMany({
        where: { parentId: { in: nodeIds } },
        select: {
          parentId: true,
          column: { select: { behavior: { select: { key: true } } } },
        },
      });
      for (const c of children) {
        const pid = c.parentId!;
        let b = countsByParent.get(pid);
        if (!b) {
          b = { backlog: 0, inProgress: 0, blocked: 0, done: 0 };
          countsByParent.set(pid, b);
        }
        const key = c.column?.behavior?.key as string | undefined;
        switch (key) {
          case 'BACKLOG':
            b.backlog++;
            break;
          case 'IN_PROGRESS':
            b.inProgress++;
            break;
          case 'BLOCKED':
            b.blocked++;
            break;
          case 'DONE':
            b.done++;
            break;
          default:
            break;
        }
      }
    }

    const nodesByColumn = new Map<string, BoardNodeDto[]>();
    for (const column of board.columns) {
      nodesByColumn.set(column.id, []);
    }

    for (const node of nodes) {
      if (!node.columnId) {
        continue;
      }
      const existing = nodesByColumn.get(node.columnId);
      if (!existing) {
        nodesByColumn.set(node.columnId, []);
      }
      const bucket = nodesByColumn.get(node.columnId)!;
      const statusMetadata = node.statusMetadata ?? null;
      const metadata = node.metadata ?? null;
      const timeTracking =
        metadata &&
        typeof metadata === 'object' &&
        !Array.isArray(metadata) &&
        metadata.timeTracking &&
        typeof metadata.timeTracking === 'object'
          ? (metadata.timeTracking as Record<string, any>)
          : {};
      const plannedStartDate =
        typeof timeTracking.plannedStartDate === 'string' &&
        timeTracking.plannedStartDate.trim().length > 0
          ? timeTracking.plannedStartDate.trim()
          : null;
      const plannedEndDate =
        typeof timeTracking.plannedEndDate === 'string' &&
        timeTracking.plannedEndDate.trim().length > 0
          ? timeTracking.plannedEndDate.trim()
          : null;
      const scheduleModeRaw =
        typeof timeTracking.scheduleMode === 'string'
          ? timeTracking.scheduleMode.toLowerCase()
          : null;
      const scheduleMode =
        scheduleModeRaw === 'asap'
          ? 'asap'
          : scheduleModeRaw === 'manual'
            ? 'manual'
            : null;
      const hardConstraint = Boolean(timeTracking.hardConstraint);
      if (Array.isArray(timeTracking.dependencies)) {
        const allowedTypes = new Set(['FS', 'SS', 'FF', 'SF']);
        (timeTracking.dependencies as Record<string, any>[]).forEach(
          (dep, index) => {
            if (!dep || typeof dep !== 'object') return;
            const fromId =
              typeof dep.fromId === 'string' ? dep.fromId.trim() : '';
            if (!fromId) return;
            const typeRaw =
              typeof dep.type === 'string' ? dep.type.toUpperCase() : '';
            if (!allowedTypes.has(typeRaw)) return;
            const id =
              typeof dep.id === 'string' && dep.id.trim().length > 0
                ? dep.id.trim()
                : `${fromId}->${node.id}:${index}`;
            const lagNumber = Number(dep.lag ?? 0);
            const lag = Number.isFinite(lagNumber) ? Math.round(lagNumber) : 0;
            const mode = dep.mode === 'FREE' ? 'FREE' : 'ASAP';
            const depHardConstraint = Boolean(dep.hardConstraint);
            ganttDependencies.push({
              id,
              fromId,
              toId: node.id,
              type: typeRaw as BoardGanttDependencyDto['type'],
              lag,
              mode,
              hardConstraint: depHardConstraint,
            });
          },
        );
      }
      const estimatedDurationRaw =
        statusMetadata && typeof statusMetadata === 'object'
          ? ((statusMetadata as Record<string, unknown>)
              .estimatedDurationDays as number | undefined)
          : undefined;
      const metadataEstimateRaw =
        metadata && typeof metadata === 'object'
          ? ((metadata as Record<string, unknown>).estimatedDurationDays as
              | number
              | undefined)
          : undefined;
      const estimatedDuration = [
        estimatedDurationRaw,
        metadataEstimateRaw,
      ].find((value) => typeof value === 'number' && Number.isFinite(value));
      const assignments = (node.assignments ?? []) as Array<{
        role: string | null;
        user: {
          id: string;
          displayName: string;
          avatarUrl: string | null;
        } | null;
      }>;

      const raciBuckets = {
        R: [] as {
          id: string;
          displayName: string;
          avatarUrl: string | null;
        }[],
        A: [] as {
          id: string;
          displayName: string;
          avatarUrl: string | null;
        }[],
        C: [] as {
          id: string;
          displayName: string;
          avatarUrl: string | null;
        }[],
        I: [] as {
          id: string;
          displayName: string;
          avatarUrl: string | null;
        }[],
      };

      for (const assignment of assignments) {
        if (!assignment.user) continue;
        const role = (assignment.role ?? '').toUpperCase();
        if (role === 'R' || role === 'A' || role === 'C' || role === 'I') {
          const bucket = raciBuckets[role];
          if (!bucket.some((entry) => entry.id === assignment.user!.id)) {
            bucket.push({
              id: assignment.user.id,
              displayName: assignment.user.displayName,
              avatarUrl: assignment.user.avatarUrl,
            });
          }
        }
      }

      const assignees = raciBuckets.R;
      const blockedReminderIntervalDays =
        typeof node.blockedReminderIntervalDays === 'number'
          ? (node.blockedReminderIntervalDays as number)
          : null;
      const blockedSinceDate =
        node.blockedSince instanceof Date ? node.blockedSince : null;
      const blockedReminderLastSentDate =
        node.blockedReminderLastSentAt instanceof Date
          ? (node.blockedReminderLastSentAt as Date)
          : null;
      let blockedReminderDueInDays: number | null = null;
      if (
        blockedReminderIntervalDays &&
        Number.isFinite(blockedReminderIntervalDays) &&
        blockedReminderIntervalDays > 0 &&
        (blockedSinceDate || blockedReminderLastSentDate)
      ) {
        const intervalMs = blockedReminderIntervalDays * DAY_IN_MS;
        const baselineDate = blockedReminderLastSentDate ?? blockedSinceDate;
        if (baselineDate && !Number.isNaN(baselineDate.getTime())) {
          const nextDueMs = baselineDate.getTime() + intervalMs;
          const remainingMs = nextDueMs - nowMs;
          blockedReminderDueInDays =
            remainingMs <= 0 ? 0 : Math.ceil(remainingMs / DAY_IN_MS);
        }
      }
      const workflow =
        workflowByNode.get(node.id) ??
        this.parseWorkflowMetadata(node.metadata ?? null);

      // Déterminer si c'est une tâche mère partagée :
      // 1. Si elle provient d'un SharedNodePlacement reçu (node.isSharedRoot déjà true)
      // 2. OU si elle a des partages actifs avec d'autres utilisateurs (propriétaire qui a partagé)
      const isSharedRoot = node.isSharedRoot ?? nodeIdsWithSharing.has(node.id);
      const canDelete = !isSharedRoot;

      bucket.push({
        id: node.id,
        title: node.title,
        columnId: node.columnId,
        position: node.position,
        parentId: node.parentId,
        dueAt: node.dueAt ? node.dueAt.toISOString() : null,
        updatedAt: node.updatedAt ? node.updatedAt.toISOString() : null,
        shortId:
          typeof node.shortId === 'number'
            ? node.shortId
            : Number(node.shortId ?? 0),
        description: node.description ?? null,
        effort: node.effort ?? null,
        priority: node.priority ?? 'NONE',
        blockedExpectedUnblockAt: node.blockedExpectedUnblockAt
          ? node.blockedExpectedUnblockAt.toISOString?.()
          : null,
        blockedReminderIntervalDays,
        blockedReminderDueInDays,
        blockedReminderLastSentAt: blockedReminderLastSentDate
          ? blockedReminderLastSentDate.toISOString()
          : null,
        blockedSince: blockedSinceDate ? blockedSinceDate.toISOString() : null,
        tags: node.tags ?? [],
        estimatedDurationDays: estimatedDuration ?? null,
        assignees,
        progress: typeof node.progress === 'number' ? node.progress : 0,
        raci: {
          responsible: raciBuckets.R,
          accountable: raciBuckets.A,
          consulted: raciBuckets.C,
          informed: raciBuckets.I,
        },
        counts: countsByParent.get(node.id) ?? {
          backlog: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
        },
        backlogHiddenUntil: workflow.backlogHiddenUntil,
        backlogNextReviewAt: workflow.backlogNextReviewAt,
        backlogReviewStartedAt: workflow.backlogReviewStartedAt,
        backlogLastInteractionAt: workflow.backlogLastInteractionAt,
        backlogLastReminderAt: workflow.backlogLastReminderAt,
        lastKnownColumnId: workflow.lastKnownColumnId,
        lastKnownColumnBehavior: workflow.lastKnownBehavior,
        doneArchiveScheduledAt: workflow.doneArchiveScheduledAt,
        isSnoozed: node.isSnoozed ?? false,
        hasRecentComment: recentCommentNodeIds.has(node.id),
        isSharedRoot,
        sharedPlacementLocked: Boolean(
          (node as { sharedPlacementLocked?: boolean }).sharedPlacementLocked,
        ),
        canDelete,
        plannedStartDate,
        plannedEndDate,
        scheduleMode,
        hardConstraint,
      } as any);
    }

    const archivedNodes = await prisma.node.findMany({
      where: { parentId: board.nodeId, archivedAt: { not: null } },
      select: { metadata: true, columnId: true },
    });
    const archivedCounts = new Map<string, number>();
    for (const archived of archivedNodes) {
      const workflow = this.parseWorkflowMetadata(archived.metadata ?? null);
      // Utiliser lastKnownColumnId OU columnId actuel
      const targetColumnId = workflow.lastKnownColumnId ?? archived.columnId;
      if (targetColumnId) {
        archivedCounts.set(
          targetColumnId,
          (archivedCounts.get(targetColumnId) ?? 0) + 1,
        );
      }
    }

    // Déterminer si le board a des tâches partagées avec d'autres utilisateurs
    // (polling n'est utile que si collaboration active)
    let isShared = false;
    if (userId) {
      const sharedCount = await prisma.sharedNodePlacement.count({
        where: {
          columnId: { in: columnIds },
          userId: { not: userId }, // Autres users que moi
        },
      });
      isShared = sharedCount > 0;
    }

    const result = {
      id: board.id,
      nodeId: board.nodeId,
      name: board.node.title,
      isShared,
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: this.normalizeColumnSettings(column.settings ?? null),
        badges: {
          archived: archivedCounts.get(column.id) ?? 0,
          snoozed: snoozedCounts.get(column.id) ?? 0,
        },
        nodes: nodesByColumn.get(column.id) ?? [],
      })),
      dependencies: ganttDependencies,
    } as BoardWithNodesDto;
    return result;
  }

  async getDueSummary(
    boardId: string,
    userId: string,
    options?: Partial<DueSummaryOptions>,
  ): Promise<{
    total: number;
    overdue: number;
    dueSoon: number;
    rangeDays: number;
    generatedAt: string;
  }> {
    const prisma = this.prisma;
    const rangeDays = Math.max(0, Math.floor(options?.rangeDays ?? 0));
    const includeDone = Boolean(options?.includeDone);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: {
            id: true,
            path: true,
          },
        },
      },
    });

    if (!board || !board.node) {
      throw new NotFoundException('Board introuvable');
    }

    const today = new Date();
    const startToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const prefix = `${board.node.path}/`;

    const computeDiff = (dueAt: Date | null): number | null => {
      if (!dueAt) return null;
      const dueDate = new Date(dueAt);
      if (Number.isNaN(dueDate.getTime())) return null;
      const startDue = new Date(
        dueDate.getFullYear(),
        dueDate.getMonth(),
        dueDate.getDate(),
      );
      return Math.round(
        (startDue.getTime() - startToday.getTime()) / DAY_IN_MS,
      );
    };

    let overdue = 0;
    let dueSoon = 0;

    if (board.isPersonal && board.ownerUserId && board.ownerUserId !== userId) {
      const placements = await prisma.sharedNodePlacement.findMany({
        where: {
          userId,
          archivedAt: null,
          node: {
            path: { startsWith: prefix },
          },
        },
        select: {
          node: { select: { dueAt: true } },
          column: { select: { behavior: { select: { key: true } } } },
        },
      });

      for (const placement of placements) {
        const behaviorKey = placement.column?.behavior?.key ?? null;
        if (!includeDone && behaviorKey === ColumnBehaviorKey.DONE) {
          continue;
        }
        const diff = computeDiff(placement.node?.dueAt ?? null);
        if (diff === null) continue;
        if (diff < 0) overdue += 1;
        else if (diff <= rangeDays) dueSoon += 1;
      }
    } else {
      const nodes = await prisma.node.findMany({
        where: {
          archivedAt: null,
          dueAt: { not: null },
          path: { startsWith: prefix },
        },
        select: {
          dueAt: true,
          column: { select: { behavior: { select: { key: true } } } },
        },
      });

      for (const node of nodes) {
        const behaviorKey = node.column?.behavior?.key ?? null;
        if (!includeDone && behaviorKey === ColumnBehaviorKey.DONE) {
          continue;
        }
        const diff = computeDiff(node.dueAt ?? null);
        if (diff === null) continue;
        if (diff < 0) overdue += 1;
        else if (diff <= rangeDays) dueSoon += 1;
      }
    }

    const total = overdue + dueSoon;

    return {
      total,
      overdue,
      dueSoon,
      rangeDays,
      generatedAt: new Date().toISOString(),
    };
  }

  async listArchivedNodes(
    boardId: string,
    columnId: string,
    userId: string,
  ): Promise<ArchivedBoardNodeDto[]> {
    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: { select: { id: true } },
        columns: { include: { behavior: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    this.ensureUserCanWriteBoard(
      {
        ownerUserId: board.ownerUserId ?? null,
        isPersonal: board.isPersonal ?? false,
      },
      userId,
    );

    const column = board.columns.find((entry) => entry.id === columnId);
    if (!column) {
      throw new NotFoundException('Colonne introuvable');
    }

    const archivedNodes = await prisma.node.findMany({
      where: {
        parentId: board.nodeId,
        archivedAt: { not: null },
        OR: [
          {
            metadata: {
              path: ['workflow', 'backlog', 'lastKnownColumnId'],
              equals: columnId,
            },
          },
          { columnId },
        ],
      },
      select: {
        id: true,
        title: true,
        archivedAt: true,
        shortId: true,
        metadata: true,
        dueAt: true,
        columnId: true,
      },
      orderBy: { archivedAt: 'desc' },
    });

    return archivedNodes
      .map((node) => {
        const workflow = this.parseWorkflowMetadata(node.metadata ?? null);
        const lastKnownColumnId =
          workflow.lastKnownColumnId ?? node.columnId ?? null;
        return {
          id: node.id,
          shortId:
            typeof node.shortId === 'number' && Number.isFinite(node.shortId)
              ? node.shortId
              : null,
          title: node.title,
          archivedAt: (node.archivedAt ?? new Date(0)).toISOString(),
          lastKnownColumnId,
          lastKnownBehavior: workflow.lastKnownBehavior,
          backlogNextReviewAt: workflow.backlogNextReviewAt,
          backlogReviewStartedAt: workflow.backlogReviewStartedAt,
          backlogHiddenUntil: workflow.backlogHiddenUntil,
          doneArchiveScheduledAt: workflow.doneArchiveScheduledAt,
          dueAt: node.dueAt ? node.dueAt.toISOString() : null,
        } satisfies ArchivedBoardNodeDto;
      })
      .filter((entry) => entry.lastKnownColumnId === columnId);
  }

  async createColumn(
    boardId: string,
    dto: CreateBoardColumnDto,
    userId: string,
  ): Promise<BoardColumnDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Le nom de la colonne est obligatoire');
    }

    const sanitizedName = dto.name.trim();
    const requestedBehaviorKey = dto.behaviorKey ?? ColumnBehaviorKey.BACKLOG;

    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: {
          select: { position: true },
          orderBy: { position: 'desc' },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    this.ensureUserCanWriteBoard(
      {
        ownerUserId: board.ownerUserId ?? null,
        isPersonal: board.isPersonal ?? false,
      },
      userId,
    );

    const behavior = await this.getOrCreateBehavior(requestedBehaviorKey);

    let wipLimit: number | null = null;
    if (dto.wipLimit !== undefined && dto.wipLimit !== null) {
      if (!Number.isInteger(dto.wipLimit) || dto.wipLimit <= 0) {
        throw new BadRequestException(
          'Le WIP limit doit etre un entier positif',
        );
      }
      wipLimit = dto.wipLimit;
    }

    const nextPosition =
      board.columns.length > 0 ? board.columns[0].position + 1 : 0;

    // Initialiser les settings par défaut selon le comportement
    let initialSettings: JsonPayload | undefined;
    if (requestedBehaviorKey === ColumnBehaviorKey.BACKLOG) {
      initialSettings = {
        backlog: {
          reviewAfterDays: DEFAULT_BACKLOG_SETTINGS.reviewAfterDays,
          reviewEveryDays: DEFAULT_BACKLOG_SETTINGS.reviewEveryDays,
          archiveAfterDays: DEFAULT_BACKLOG_SETTINGS.archiveAfterDays,
        },
      };
    } else if (requestedBehaviorKey === ColumnBehaviorKey.DONE) {
      initialSettings = {
        done: {
          archiveAfterDays: DEFAULT_DONE_SETTINGS.archiveAfterDays,
        },
      };
    }

    const created = await prisma.column.create({
      data: {
        boardId,
        name: sanitizedName,
        behaviorId: behavior.id,
        position: nextPosition,
        wipLimit,
        settings: initialSettings,
      },
      include: {
        behavior: true,
      },
    });

    return {
      id: created.id,
      name: created.name,
      behaviorKey: created.behavior.key,
      position: created.position,
      wipLimit: created.wipLimit,
      settings: this.normalizeColumnSettings(created.settings ?? null),
    };
  }

  async updateColumn(
    boardId: string,
    columnId: string,
    dto: UpdateBoardColumnDto,
    userId: string,
  ): Promise<BoardColumnDto> {
    if (
      dto.name === undefined &&
      dto.wipLimit === undefined &&
      dto.position === undefined
    ) {
      throw new BadRequestException('Aucune modification fournie');
    }

    const prisma = this.prisma;
    const column = await prisma.column.findFirst({
      where: { id: columnId, boardId },
      include: {
        board: {
          include: {
            columns: {
              select: { id: true, position: true },
              orderBy: { position: 'asc' },
            },
          },
        },
        behavior: true,
      },
    });

    if (!column) {
      throw new NotFoundException('Colonne introuvable');
    }

    this.ensureUserCanWriteBoard(
      {
        ownerUserId: column.board.ownerUserId ?? null,
        isPersonal: column.board.isPersonal ?? false,
      },
      userId,
    );

    const currentSettings = this.normalizeColumnSettings(
      column.settings ?? null,
    );
    const updateData: ColumnUpdatePayload = {};
    let hasChange = false;
    let settingsChanged = false;
    let nextSettingsPayload: JsonPayload | undefined;

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException('Le nom de la colonne est obligatoire');
      }
      if (trimmed !== column.name) {
        updateData.name = trimmed;
        hasChange = true;
      }
    }

    if (dto.wipLimit !== undefined) {
      if (dto.wipLimit === null) {
        if (column.wipLimit !== null) {
          updateData.wipLimit = null;
          hasChange = true;
        }
      } else {
        if (!Number.isInteger(dto.wipLimit) || dto.wipLimit <= 0) {
          throw new BadRequestException(
            'Le WIP limit doit etre un entier positif',
          );
        }
        if (column.wipLimit !== dto.wipLimit) {
          updateData.wipLimit = dto.wipLimit;
          hasChange = true;
        }
      }
    }

    if (
      dto.backlogSettings !== undefined &&
      column.behavior.key !== ColumnBehaviorKey.BACKLOG
    ) {
      throw new BadRequestException(
        'backlogSettings ne peut etre utilise que sur une colonne Backlog',
      );
    }
    if (
      dto.doneSettings !== undefined &&
      column.behavior.key !== ColumnBehaviorKey.DONE
    ) {
      throw new BadRequestException(
        'doneSettings ne peut etre utilise que sur une colonne Termine',
      );
    }

    if (dto.backlogSettings !== undefined) {
      const normalized = this.normalizeBacklogSettings(currentSettings);
      const updates = dto.backlogSettings ?? {};
      const nextBacklog = { ...normalized };
      let backlogChanged = false;

      if (updates.reviewAfterDays !== undefined) {
        const value = this.parseIntegerSetting(
          'reviewAfterDays (jours)',
          updates.reviewAfterDays,
          1,
          365,
        );
        if (value !== normalized.reviewAfterDays) {
          nextBacklog.reviewAfterDays = value;
          backlogChanged = true;
        }
      }

      if (updates.reviewEveryDays !== undefined) {
        const value = this.parseIntegerSetting(
          'reviewEveryDays (jours)',
          updates.reviewEveryDays,
          1,
          365,
        );
        if (value !== normalized.reviewEveryDays) {
          nextBacklog.reviewEveryDays = value;
          backlogChanged = true;
        }
      }

      if (updates.archiveAfterDays !== undefined) {
        const value = this.parseIntegerSetting(
          'archiveAfterDays (jours)',
          updates.archiveAfterDays,
          1,
          730,
        );
        if (value !== normalized.archiveAfterDays) {
          nextBacklog.archiveAfterDays = value;
          backlogChanged = true;
        }
      }

      if (backlogChanged) {
        const base = currentSettings ? { ...currentSettings } : {};
        base.backlog = nextBacklog;
        nextSettingsPayload = base as JsonPayload;
        settingsChanged = true;
      }
    }

    if (dto.doneSettings !== undefined) {
      const normalized = this.normalizeDoneSettings(currentSettings);
      const updates = dto.doneSettings ?? {};
      const nextDone = { ...normalized };
      let doneChanged = false;

      if (updates.archiveAfterDays !== undefined) {
        const value = this.parseIntegerSetting(
          'archiveAfterDays (jours)',
          updates.archiveAfterDays,
          0,
          730,
        );
        if (value !== normalized.archiveAfterDays) {
          nextDone.archiveAfterDays = value;
          doneChanged = true;
        }
      }

      if (doneChanged) {
        const base = currentSettings ? { ...currentSettings } : {};
        base.done = nextDone;
        nextSettingsPayload = base as JsonPayload;
        settingsChanged = true;
      }
    }

    if (settingsChanged && nextSettingsPayload !== undefined) {
      updateData.settings = nextSettingsPayload;
      hasChange = true;
    }

    const orderedColumns = [...column.board.columns].sort(
      (a, b) => a.position - b.position,
    );
    const currentIndex = orderedColumns.findIndex(
      (entry) => entry.id === column.id,
    );
    if (currentIndex === -1) {
      throw new NotFoundException('Colonne introuvable');
    }

    let reorderPlan: { id: string; position: number }[] | null = null;
    if (dto.position !== undefined) {
      if (!Number.isInteger(dto.position) || dto.position < 0) {
        throw new BadRequestException(
          'La position doit etre un entier positif',
        );
      }
      const clampedIndex = Math.min(dto.position, orderedColumns.length - 1);
      if (clampedIndex !== currentIndex) {
        const reordered = [...orderedColumns];
        const [moving] = reordered.splice(currentIndex, 1);
        reordered.splice(clampedIndex, 0, moving);
        reorderPlan = reordered.map((entry, index) => ({
          id: entry.id,
          position: index,
        }));
        hasChange = true;
      }
    }

    if (!hasChange) {
      return {
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: currentSettings,
      };
    }

    const updated = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (reorderPlan) {
          const originalPositions = new Map(
            orderedColumns.map((entry) => [entry.id, entry.position] as const),
          );
          for (const entry of reorderPlan) {
            if (originalPositions.get(entry.id) === entry.position) {
              continue;
            }
            await tx.column.update({
              where: { id: entry.id },
              data: { position: entry.position },
            });
          }
        }

        if (Object.keys(updateData).length > 0) {
          await tx.column.update({
            where: { id: column.id },
            data: updateData as any,
          });
        }

        return tx.column.findUnique({
          where: { id: column.id },
          include: { behavior: true },
        });
      },
    );

    if (!updated) {
      throw new NotFoundException('Colonne introuvable');
    }

    return {
      id: updated.id,
      name: updated.name,
      behaviorKey: updated.behavior.key,
      position: updated.position,
      wipLimit: updated.wipLimit,
      settings: this.normalizeColumnSettings(updated.settings ?? null),
    };
  }

  async deleteColumn(
    boardId: string,
    columnId: string,
    userId: string,
  ): Promise<void> {
    const prisma = this.prisma;
    const column = await prisma.column.findFirst({
      where: { id: columnId, boardId },
      include: {
        board: true,
        _count: { select: { nodes: true } },
      },
    });

    if (!column) {
      throw new NotFoundException('Colonne introuvable');
    }

    this.ensureUserCanWriteBoard(
      {
        ownerUserId: column.board.ownerUserId ?? null,
        isPersonal: column.board.isPersonal ?? false,
      },
      userId,
    );

    if (column._count.nodes > 0) {
      throw new BadRequestException(
        'Impossible de supprimer une colonne contenant des cartes',
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.column.delete({ where: { id: column.id } });
      const remaining = await tx.column.findMany({
        where: { boardId },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });

      for (let index = 0; index < remaining.length; index += 1) {
        const entry = remaining[index];
        if (entry.position === index) {
          continue;
        }
        await tx.column.update({
          where: { id: entry.id },
          data: { position: index },
        });
      }
    });
  }

  private ensureUserCanWriteBoard(
    board: {
      ownerUserId: string | null;
      isPersonal: boolean;
    },
    userId: string,
  ) {
    if (board.ownerUserId === userId) {
      return;
    }

    throw new ForbiddenException('Vous ne pouvez pas modifier ce board');
  }

  private async getOrCreateBehavior(key: ColumnBehaviorKey) {
    const prisma = this.prisma;
    const existing = await prisma.columnBehavior.findFirst({
      where: { key },
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return existing;
    }

    const defaults = COLUMN_BEHAVIOR_DEFAULTS[key] ?? {
      label: key,
      color: null,
    };

    return prisma.columnBehavior.create({
      data: {
        key,
        label: defaults.label,
        color: defaults.color,
      },
    });
  }

  private normalizeBacklogSettings(
    settings: Record<string, any> | null,
  ): BacklogColumnSettings {
    const source =
      settings && isPlainObject((settings as any).backlog)
        ? ((settings as any).backlog as Record<string, any>)
        : (settings ?? {});
    const ensure = (
      value: unknown,
      fallback: number,
      min: number,
      max: number,
    ) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      const rounded = Math.floor(num);
      if (rounded < min) return min;
      if (rounded > max) return max;
      return rounded;
    };
    return {
      reviewAfterDays: ensure(
        (source as any).reviewAfterDays,
        DEFAULT_BACKLOG_SETTINGS.reviewAfterDays,
        1,
        365,
      ),
      reviewEveryDays: ensure(
        (source as any).reviewEveryDays,
        DEFAULT_BACKLOG_SETTINGS.reviewEveryDays,
        1,
        365,
      ),
      archiveAfterDays: ensure(
        (source as any).archiveAfterDays,
        DEFAULT_BACKLOG_SETTINGS.archiveAfterDays,
        1,
        730,
      ),
    };
  }

  private normalizeDoneSettings(
    settings: Record<string, any> | null,
  ): DoneColumnSettings {
    const source =
      settings && isPlainObject((settings as any).done)
        ? ((settings as any).done as Record<string, any>)
        : (settings ?? {});
    const ensure = (value: unknown, fallback: number) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      const rounded = Math.floor(num);
      if (rounded < 0) return 0;
      if (rounded > 730) return 730;
      return rounded;
    };
    return {
      archiveAfterDays: ensure(
        (source as any).archiveAfterDays,
        DEFAULT_DONE_SETTINGS.archiveAfterDays,
      ),
    };
  }

  private parseIntegerSetting(
    label: string,
    value: unknown,
    min: number,
    max: number,
  ): number {
    if (value === null || value === undefined) {
      throw new BadRequestException(
        `${label} est requis et doit etre un entier`,
      );
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      throw new BadRequestException(
        `${label} doit etre un entier compris entre ${min} et ${max}`,
      );
    }
    if (parsed < min || parsed > max) {
      throw new BadRequestException(
        `${label} doit etre compris entre ${min} et ${max}`,
      );
    }
    return parsed;
  }

  private normalizeColumnSettings(value: unknown): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return { ...(value as Record<string, any>) };
  }

  /**
   * Répare les colonnes ayant settings null en écrivant les defaults.
   * Cette opération est idempotente et ne modifie pas les colonnes déjà configurées.
   */
  private async repairMissingColumnSettings(
    columns: Array<{
      id: string;
      behavior: { key: ColumnBehaviorKey };
      settings: unknown;
    }>,
  ): Promise<void> {
    const repairs: Array<{ id: string; payload: JsonPayload }> = [];
    for (const col of columns) {
      const raw = this.normalizeColumnSettings(col.settings ?? null);
      if (raw) continue; // déjà configuré
      if (col.behavior.key === ColumnBehaviorKey.BACKLOG) {
        repairs.push({
          id: col.id,
          payload: {
            backlog: {
              reviewAfterDays: DEFAULT_BACKLOG_SETTINGS.reviewAfterDays,
              reviewEveryDays: DEFAULT_BACKLOG_SETTINGS.reviewEveryDays,
              archiveAfterDays: DEFAULT_BACKLOG_SETTINGS.archiveAfterDays,
            },
          } as JsonPayload,
        });
      } else if (col.behavior.key === ColumnBehaviorKey.DONE) {
        repairs.push({
          id: col.id,
          payload: {
            done: {
              archiveAfterDays: DEFAULT_DONE_SETTINGS.archiveAfterDays,
            },
          } as JsonPayload,
        });
      }
    }
    if (!repairs.length) return;
    // Effectuer les updates en batch via transaction pour minimiser l'impact.
    const prisma = this.prisma;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const entry of repairs) {
        await tx.column.update({
          where: { id: entry.id },
          data: { settings: entry.payload } as any,
        });
      }
    });
    // Mettre à jour l'objet columns en mémoire avec les nouvelles valeurs pour réponse immédiate.
    const map = new Map(repairs.map((r) => [r.id, r.payload]));
    for (const col of columns) {
      const payload = map.get(col.id);
      if (payload) {
        (col as any).settings = payload;
      }
    }
  }

  private parseWorkflowMetadata(metadata: unknown): ParsedWorkflowSnapshot {
    const root =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, any>)
        : {};
    const workflow =
      root.workflow &&
      typeof root.workflow === 'object' &&
      !Array.isArray(root.workflow)
        ? (root.workflow as Record<string, any>)
        : {};
    const backlog =
      workflow.backlog &&
      typeof workflow.backlog === 'object' &&
      !Array.isArray(workflow.backlog)
        ? (workflow.backlog as Record<string, any>)
        : {};
    const done =
      workflow.done &&
      typeof workflow.done === 'object' &&
      !Array.isArray(workflow.done)
        ? (workflow.done as Record<string, any>)
        : {};

    const backlogHiddenUntil = toIsoDateTime(backlog.hiddenUntil);
    const backlogNextReviewAt = toIsoDateTime(backlog.nextReviewAt);
    const backlogReviewStartedAt = toIsoDateTime(backlog.reviewStartedAt);
    const backlogLastInteractionAt = toIsoDateTime(backlog.lastInteractionAt);
    const backlogLastReminderAt = toIsoDateTime(backlog.lastReminderAt);
    const lastKnownColumnId =
      typeof backlog.lastKnownColumnId === 'string'
        ? backlog.lastKnownColumnId
        : null;
    const lastKnownBehaviorRaw =
      typeof backlog.lastKnownBehavior === 'string'
        ? backlog.lastKnownBehavior
        : null;
    const validBehaviors = new Set(Object.values(ColumnBehaviorKey));
    const lastKnownBehavior = validBehaviors.has(
      lastKnownBehaviorRaw as ColumnBehaviorKey,
    )
      ? (lastKnownBehaviorRaw as ColumnBehaviorKey)
      : null;
    const doneArchiveScheduledAt = toIsoDateTime(done.archiveScheduledAt);

    return {
      backlogHiddenUntil,
      backlogNextReviewAt,
      backlogReviewStartedAt,
      backlogLastInteractionAt,
      backlogLastReminderAt,
      lastKnownColumnId,
      lastKnownBehavior,
      doneArchiveScheduledAt,
    };
  }

  async resetBacklogArchiveCounter(
    boardId: string,
    nodeId: string,
    userId: string,
  ): Promise<void> {
    const prisma = this.prisma;
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { node: { select: { teamId: true } } },
    });
    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    this.ensureUserCanWriteBoard(
      {
        ownerUserId: board.ownerUserId ?? null,
        isPersonal: board.isPersonal ?? false,
      },
      userId,
    );

    const node = await prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, metadata: true, columnId: true },
    });

    if (!node) {
      throw new NotFoundException('Tache introuvable');
    }

    const now = new Date();
    const updatedMetadata = {
      ...(typeof node.metadata === 'object' && node.metadata !== null
        ? node.metadata
        : {}),
      workflow: {
        ...(typeof node.metadata?.workflow === 'object' &&
        node.metadata?.workflow !== null
          ? node.metadata.workflow
          : {}),
        backlog: {
          ...(typeof node.metadata?.workflow?.backlog === 'object' &&
          node.metadata?.workflow?.backlog !== null
            ? node.metadata.workflow.backlog
            : {}),
          lastInteractionAt: now.toISOString(),
        },
      },
    };

    await prisma.node.update({
      where: { id: nodeId },
      data: { metadata: updatedMetadata } as any,
    });
  }
}
