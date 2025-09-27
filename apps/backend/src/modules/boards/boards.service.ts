import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ColumnBehaviorKey, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardColumnDto } from './dto/board-column.dto';
import { BoardDto } from './dto/board.dto';
import { BoardWithNodesDto } from './dto/board-with-nodes.dto';
import { BoardNodeDto } from './dto/board-node.dto';
import { CreateBoardColumnDto } from './dto/create-board-column.dto';
import { UpdateBoardColumnDto } from './dto/update-board-column.dto';

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
          include: { behavior: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!board) {
      throw new NotFoundException();
    }

    const columnIds = board.columns.map((column) => column.id);
    const nodes = columnIds.length
      ? await this.prisma.node.findMany({
          where: { columnId: { in: columnIds } },
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
            blockedExpectedUnblockAt: true,
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
        R: [] as { id: string; displayName: string; avatarUrl: string | null }[],
        A: [] as { id: string; displayName: string; avatarUrl: string | null }[],
        C: [] as { id: string; displayName: string; avatarUrl: string | null }[],
        I: [] as { id: string; displayName: string; avatarUrl: string | null }[],
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
      });
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
        nodes: nodesByColumn.get(column.id) ?? [],
      })),
    };
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

    const created = await this.prisma.column.create({
      data: {
        boardId,
        name: sanitizedName,
        behaviorId: behavior.id,
        position: nextPosition,
        wipLimit,
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

    const updateData: { name?: string; wipLimit?: number | null } = {};
    let hasChange = false;

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
}
