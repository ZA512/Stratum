import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ColumnBehaviorKey, MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardColumnDto } from './dto/board-column.dto';
import { BoardDto } from './dto/board.dto';
import { BoardWithNodesDto } from './dto/board-with-nodes.dto';
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

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(boardId: string): Promise<BoardDto> {
    const board = await this.prisma.board.findUnique({
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

    return {
      id: board.id,
      nodeId: board.nodeId,
      name: board.node.title,
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: this.normalizeColumnSettings((column as any).settings ?? null),
      })),
    };
  }

  async getRootBoardForTeam(teamId: string): Promise<BoardDto> {
    const board = await this.prisma.board.findFirst({
      where: {
        node: {
          teamId,
          parentId: null,
        },
      },
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
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable pour cette equipe');
    }

    return {
      id: board.id,
      nodeId: board.nodeId,
      name: board.node.title,
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: this.normalizeColumnSettings((column as any).settings ?? null),
      })),
    };
  }

  async getBoardWithNodes(boardId: string): Promise<BoardWithNodesDto> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: {
            id: true,
            title: true,
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

    const columnIds = board.columns.map((column) => column.id);
    const rawNodes = columnIds.length
      ? await this.prisma.node.findMany({
          where: { columnId: { in: columnIds }, archivedAt: null },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            columnId: true,
            position: true,
            parentId: true,
            dueAt: true,
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
        })
      : [];

    const behaviorByColumn = new Map<string, ColumnBehaviorKey>();
    for (const column of board.columns) {
      behaviorByColumn.set(column.id, column.behavior.key);
    }

    const workflowByNode = new Map<string, ParsedWorkflowSnapshot>();
    const snoozedCounts = new Map<string, number>();
    const nodes = [] as typeof rawNodes;
    const nowMs = Date.now();

    for (const node of rawNodes) {
      const workflow = this.parseWorkflowMetadata(node.metadata ?? null);
      workflowByNode.set(node.id, workflow);
      const behavior = node.columnId ? behaviorByColumn.get(node.columnId) : null;
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
      nodes.push({ ...node, isSnoozed } as any);
    }

    // Pré-calculer les counts des enfants par carte (parentId = id de la carte)
    const countsByParent = new Map<
      string,
      { backlog: number; inProgress: number; blocked: number; done: number }
    >();
    if (nodes.length > 0) {
      const nodeIds = nodes.map((n) => n.id);
      const children = await this.prisma.node.findMany({
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
        const key = c.column?.behavior?.key;
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
      const estimatedDurationRaw =
        statusMetadata && typeof statusMetadata === 'object'
          ? (statusMetadata as Record<string, unknown>).estimatedDurationDays
          : undefined;
      const metadataEstimateRaw =
        metadata && typeof metadata === 'object'
          ? (metadata as Record<string, unknown>).estimatedDurationDays
          : undefined;
      const estimatedDuration = [
        estimatedDurationRaw,
        metadataEstimateRaw,
      ].find((value) => typeof value === 'number' && Number.isFinite(value)) as
        | number
        | undefined;
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
        typeof (node as any).blockedReminderIntervalDays === 'number'
          ? ((node as any).blockedReminderIntervalDays as number)
          : null;
      const blockedSinceDate =
        node.blockedSince instanceof Date ? node.blockedSince : null;
      const blockedReminderLastSentDate =
        (node as any).blockedReminderLastSentAt instanceof Date
          ? ((node as any).blockedReminderLastSentAt as Date)
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
          blockedReminderDueInDays = remainingMs <= 0
            ? 0
            : Math.ceil(remainingMs / DAY_IN_MS);
        }
      }
      const workflow = workflowByNode.get(node.id) ?? this.parseWorkflowMetadata(node.metadata ?? null);
      bucket.push({
        id: node.id,
        title: node.title,
        columnId: node.columnId,
        position: node.position,
        parentId: node.parentId,
        dueAt: node.dueAt ? node.dueAt.toISOString() : null,
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
        blockedSince: blockedSinceDate
          ? blockedSinceDate.toISOString()
          : null,
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
        isSnoozed: (node as any).isSnoozed ?? false,
      } as any);
    }

    const archivedNodes = await this.prisma.node.findMany({
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

    return {
      id: board.id,
      nodeId: board.nodeId,
      name: board.node.title,
      columns: board.columns.map((column) => ({
        id: column.id,
        name: column.name,
        behaviorKey: column.behavior.key,
        position: column.position,
        wipLimit: column.wipLimit,
        settings: this.normalizeColumnSettings((column as any).settings ?? null),
        badges: {
          archived: archivedCounts.get(column.id) ?? 0,
          snoozed: snoozedCounts.get(column.id) ?? 0,
        },
        nodes: nodesByColumn.get(column.id) ?? [],
      })),
    };
  }

  async listArchivedNodes(
    boardId: string,
    columnId: string,
    userId: string,
  ): Promise<ArchivedBoardNodeDto[]> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: { select: { id: true, teamId: true } },
        columns: { include: { behavior: true }, orderBy: { position: 'asc' } },
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    await this.ensureUserCanWrite(board.node.teamId, userId);

    const column = board.columns.find((entry) => entry.id === columnId);
    if (!column) {
      throw new NotFoundException('Colonne introuvable');
    }

    const archivedNodes = await this.prisma.node.findMany({
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

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: {
        node: {
          select: { teamId: true },
        },
        columns: {
          select: { position: true },
          orderBy: { position: 'desc' },
        },
      },
    });

    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    await this.ensureUserCanWrite(board.node.teamId, userId);

    const behavior = await this.getOrCreateBehavior(
      board.node.teamId,
      requestedBehaviorKey,
    );

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
    let initialSettings: Prisma.InputJsonValue | undefined;
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

    const created = await this.prisma.column.create({
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
      settings: this.normalizeColumnSettings((created as any).settings ?? null),
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

    const column = await this.prisma.column.findFirst({
      where: { id: columnId, boardId },
      include: {
        board: {
          include: {
            node: { select: { teamId: true } },
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

    await this.ensureUserCanWrite(column.board.node.teamId, userId);

    const currentSettings = this.normalizeColumnSettings(
      (column as any).settings ?? null,
    );
    const updateData: Prisma.ColumnUpdateInput = {};
    let hasChange = false;
    let settingsChanged = false;
    let nextSettingsPayload: Prisma.InputJsonValue | undefined;

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
        nextSettingsPayload = base as Prisma.InputJsonValue;
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
        nextSettingsPayload = base as Prisma.InputJsonValue;
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

    const updated = await this.prisma.$transaction(async (tx) => {
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
          data: updateData,
        });
      }

      return tx.column.findUnique({
        where: { id: column.id },
        include: { behavior: true },
      });
    });

    if (!updated) {
      throw new NotFoundException('Colonne introuvable');
    }

    return {
      id: updated.id,
      name: updated.name,
      behaviorKey: updated.behavior.key,
      position: updated.position,
      wipLimit: updated.wipLimit,
      settings: this.normalizeColumnSettings((updated as any).settings ?? null),
    };
  }

  async deleteColumn(
    boardId: string,
    columnId: string,
    userId: string,
  ): Promise<void> {
    const column = await this.prisma.column.findFirst({
      where: { id: columnId, boardId },
      include: {
        board: { include: { node: { select: { teamId: true } } } },
        _count: { select: { nodes: true } },
      },
    });

    if (!column) {
      throw new NotFoundException('Colonne introuvable');
    }

    await this.ensureUserCanWrite(column.board.node.teamId, userId);

    if (column._count.nodes > 0) {
      throw new BadRequestException(
        'Impossible de supprimer une colonne contenant des cartes',
      );
    }

    await this.prisma.$transaction(async (tx) => {
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

  private async ensureUserCanWrite(teamId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: {
        teamId,
        userId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new ForbiddenException('Vous ne pouvez pas modifier ce board');
    }
  }

  private async getOrCreateBehavior(teamId: string, key: ColumnBehaviorKey) {
    const existing = await this.prisma.columnBehavior.findFirst({
      where: { teamId, key },
    });

    if (existing) {
      return existing;
    }

    const defaults = COLUMN_BEHAVIOR_DEFAULTS[key] ?? {
      label: key,
      color: null,
    };

    return this.prisma.columnBehavior.create({
      data: {
        teamId,
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
        : settings ?? {};
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
        : settings ?? {};
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
  private async repairMissingColumnSettings(columns: Array<{ id: string; behavior: { key: ColumnBehaviorKey }; settings: Prisma.JsonValue | null }>): Promise<void> {
    const repairs: Array<{ id: string; payload: Prisma.InputJsonValue }> = [];
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
          } as Prisma.InputJsonValue,
        });
      } else if (col.behavior.key === ColumnBehaviorKey.DONE) {
        repairs.push({
          id: col.id,
          payload: {
            done: {
              archiveAfterDays: DEFAULT_DONE_SETTINGS.archiveAfterDays,
            },
          } as Prisma.InputJsonValue,
        });
      }
    }
    if (!repairs.length) return;
    // Effectuer les updates en batch via transaction pour minimiser l'impact.
    await this.prisma.$transaction(async (tx) => {
      for (const entry of repairs) {
        await tx.column.update({ where: { id: entry.id }, data: { settings: entry.payload } });
      }
    });
    // Mettre à jour l'objet columns en mémoire avec les nouvelles valeurs pour réponse immédiate.
    const map = new Map(repairs.map(r => [r.id, r.payload]));
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
      root.workflow && typeof root.workflow === 'object' && !Array.isArray(root.workflow)
        ? (root.workflow as Record<string, any>)
        : {};
    const backlog =
      workflow.backlog && typeof workflow.backlog === 'object' && !Array.isArray(workflow.backlog)
        ? (workflow.backlog as Record<string, any>)
        : {};
    const done =
      workflow.done && typeof workflow.done === 'object' && !Array.isArray(workflow.done)
        ? (workflow.done as Record<string, any>)
        : {};

    const backlogHiddenUntil = toIsoDateTime(backlog.hiddenUntil);
    const backlogNextReviewAt = toIsoDateTime(backlog.nextReviewAt);
    const backlogReviewStartedAt = toIsoDateTime(backlog.reviewStartedAt);
    const backlogLastInteractionAt = toIsoDateTime(
      backlog.lastInteractionAt,
    );
    const backlogLastReminderAt = toIsoDateTime(backlog.lastReminderAt);
    const lastKnownColumnId =
      typeof backlog.lastKnownColumnId === 'string'
        ? backlog.lastKnownColumnId
        : null;
    const lastKnownBehaviorRaw =
      typeof backlog.lastKnownBehavior === 'string'
        ? (backlog.lastKnownBehavior as string)
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
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      include: { node: { select: { teamId: true } } },
    });
    if (!board) {
      throw new NotFoundException('Board introuvable');
    }

    await this.ensureUserCanWrite(board.node.teamId, userId);

    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, metadata: true, columnId: true },
    });

    if (!node) {
      throw new NotFoundException('Tache introuvable');
    }

    const workflow = this.parseWorkflowMetadata(node.metadata);
    const now = new Date();
    const updatedMetadata = {
      ...(typeof node.metadata === 'object' && node.metadata !== null
        ? node.metadata
        : {}),
      workflow: {
        ...(typeof (node.metadata as any)?.workflow === 'object' &&
        (node.metadata as any)?.workflow !== null
          ? (node.metadata as any).workflow
          : {}),
        backlog: {
          ...(typeof (node.metadata as any)?.workflow?.backlog === 'object' &&
          (node.metadata as any)?.workflow?.backlog !== null
            ? (node.metadata as any).workflow.backlog
            : {}),
          lastInteractionAt: now.toISOString(),
        },
      },
    };

    await this.prisma.node.update({
      where: { id: nodeId },
      data: { metadata: updatedMetadata as Prisma.InputJsonValue },
    });
  }
}
