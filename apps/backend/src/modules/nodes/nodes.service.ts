import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ColumnBehaviorKey,
  MembershipStatus,
  Node as NodeModel,
  NodeType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { ConvertNodeDto } from './dto/convert-node.dto';
import { NodeDto } from './dto/node.dto';
import { NodeDetailDto } from './dto/node-detail.dto';
import {
  ChecklistDto,
  ChecklistItemDto,
  NodeAssignmentDto,
  NodeMinimalChildDto,
} from './dto/node-detail.dto';
import { NodeBreadcrumbDto } from './dto/node-breadcrumb.dto';
import { NodeBreadcrumbItemDto } from './dto/node-breadcrumb-item.dto';
import { NodeChildBoardDto } from './dto/node-child-board.dto';

function normalizeJson(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

@Injectable()
export class NodesService {
  constructor(private readonly prisma: PrismaService) {}

  async getNode(nodeId: string): Promise<NodeDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException();
    }
    return this.mapNode(node);
  }

  async createNode(dto: CreateNodeDto, userId: string): Promise<NodeDto> {
    if (!dto.title?.trim()) {
      throw new BadRequestException('Le titre est obligatoire');
    }

    const column = await this.prisma.column.findUnique({
      where: { id: dto.columnId },
      include: {
        board: {
          include: {
            node: {
              select: { id: true, path: true, depth: true, teamId: true },
            },
          },
        },
      },
    });

    if (!column || !column.board?.node) {
      throw new NotFoundException('Colonne introuvable');
    }

    const boardNode = column.board.node;
    const parentId = dto.parentId ?? boardNode.id;

    const parent = await this.resolveParent(parentId, boardNode);

    if (parent.teamId !== boardNode.teamId) {
      throw new BadRequestException(
        'Le parent et la colonne doivent appartenir a la meme equipe',
      );
    }

    await this.ensureUserCanWrite(boardNode.teamId, userId);

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.dueAt && Number.isNaN(dueAt?.getTime())) {
      throw new BadRequestException('Date de livraison invalide');
    }

    const requestedType = (dto.type ?? 'SIMPLE') as NodeType;

    const node = await this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.node.aggregate({
        where: { parentId: parent.id, columnId: column.id },
        _max: { position: true },
      });

      const newNodeId = randomUUID();
      const created = await tx.node.create({
        data: {
          id: newNodeId,
          teamId: boardNode.teamId,
          parentId: parent.id,
          columnId: column.id,
          type: NodeType.SIMPLE,
          title: dto.title.trim(),
          description: dto.description ?? null,
          path: parent.path + '/' + newNodeId,
          depth: parent.depth + 1,
          position: (aggregate._max.position ?? 0) + 1,
          createdById: userId,
          dueAt,
        },
      });

      if (requestedType === NodeType.MEDIUM) {
        return this.promoteToMedium(tx, created, dto.checklistItems ?? []);
      }

      if (requestedType === NodeType.COMPLEX) {
        return this.promoteToComplex(tx, created, boardNode.teamId);
      }

      return created;
    });

    return this.mapNode(node);
  }

  async convertNode(
    nodeId: string,
    dto: ConvertNodeDto,
    userId: string,
  ): Promise<NodeDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) {
      throw new NotFoundException();
    }

    await this.ensureUserCanWrite(node.teamId, userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.node.findUniqueOrThrow({
        where: { id: nodeId },
      });

      if (dto.targetType === NodeType.MEDIUM) {
        if (current.type === NodeType.COMPLEX) {
          throw new BadRequestException(
            'Impossible de retrograder directement un kanban complexe',
          );
        }
        return this.promoteToMedium(tx, current, dto.checklistItems ?? []);
      }

      if (dto.targetType === NodeType.COMPLEX) {
        return this.promoteToComplex(tx, current, current.teamId);
      }

      return this.demoteToSimple(tx, current);
    });

    return this.mapNode(updated);
  }

  private async resolveParent(
    parentId: string,
    boardNode: { id: string; path: string; depth: number; teamId: string },
  ) {
    if (parentId === boardNode.id) {
      return boardNode;
    }

    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        path: true,
        depth: true,
        teamId: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent introuvable');
    }

    return parent;
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
      throw new ForbiddenException(
        'Vous ne pouvez pas ecrire sur cette equipe',
      );
    }
  }

  private async promoteToMedium(
    tx: Prisma.TransactionClient,
    node: NodeModel,
    checklistItems: string[],
  ) {
    if (node.type === NodeType.COMPLEX) {
      throw new BadRequestException('Le noeud est deja complexe');
    }

    const checklist = await tx.checklist.upsert({
      where: { nodeId: node.id },
      update: {},
      create: { nodeId: node.id },
    });

    await tx.checklistItem.deleteMany({ where: { checklistId: checklist.id } });

    if (checklistItems.length > 0) {
      await tx.checklistItem.createMany({
        data: checklistItems.map((item, index) => ({
          id: randomUUID(),
          checklistId: checklist.id,
          content: item,
          isDone: false,
          position: index,
        })),
      });
    }

    const total = await tx.checklistItem.count({
      where: { checklistId: checklist.id },
    });

    await tx.checklist.update({
      where: { id: checklist.id },
      data: { progress: 0 },
    });

    return tx.node.update({
      where: { id: node.id },
      data: {
        type: NodeType.MEDIUM,
        statusMetadata: {
          checklistCompleted: 0,
          checklistTotal: total,
        },
      },
    });
  }

  private async promoteToComplex(
    tx: Prisma.TransactionClient,
    node: NodeModel,
    teamId: string,
  ) {
    let board = await tx.board.findUnique({ where: { nodeId: node.id } });
    if (!board) {
      board = await tx.board.create({ data: { nodeId: node.id } });
      const behaviors = await this.ensureDefaultColumnBehaviors(tx, teamId);
      await this.createDefaultColumns(tx, board.id, behaviors);
    }

    await tx.checklistItem.deleteMany({
      where: { checklist: { nodeId: node.id } },
    });
    await tx.checklist.deleteMany({ where: { nodeId: node.id } });

    return tx.node.update({
      where: { id: node.id },
      data: {
        type: NodeType.COMPLEX,
        statusMetadata: {
          boardId: board.id,
        },
      },
    });
  }

  async getNodeDetail(nodeId: string): Promise<NodeDetailDto> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        assignments: true,
        checklist: {
          include: {
            items: {
              orderBy: { position: 'asc' },
            },
          },
        },
        children: {
          select: {
            id: true,
            title: true,
            type: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!node) {
      throw new NotFoundException();
    }

    const checklist: ChecklistDto | null = node.checklist
      ? {
          id: node.checklist.id,
          progress: node.checklist.progress,
          items: node.checklist.items.map(
            (item) =>
              ({
                id: item.id,
                content: item.content,
                isDone: item.isDone,
                position: item.position,
              }) as ChecklistItemDto,
          ),
        }
      : null;

    const assignments: NodeAssignmentDto[] = node.assignments.map(
      (assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        role: assignment.role ?? null,
      }),
    );

    const children: NodeMinimalChildDto[] = node.children.map((child) => ({
      id: child.id,
      title: child.title,
      type: child.type,
    }));

    return {
      ...this.mapNode(node),
      assignments,
      checklist,
      children,
    };
  }
  async listChildBoards(nodeId: string): Promise<NodeChildBoardDto[]> {
    const children = await this.prisma.node.findMany({
      where: {
        parentId: nodeId,
        type: NodeType.COMPLEX,
      },
      select: {
        id: true,
        title: true,
        board: {
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        position: 'asc',
      },
    });

    return children
      .filter((child) => child.board)
      .map((child) => ({
        nodeId: child.id,
        boardId: child.board!.id,
        name: child.title,
      }));
  }
  async getBreadcrumb(nodeId: string): Promise<NodeBreadcrumbDto> {
    const current = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        title: true,
        type: true,
        parentId: true,
        depth: true,
      },
    });

    if (!current) {
      throw new NotFoundException();
    }

    const chain: (typeof current)[] = [];
    let cursor: typeof current | null = current;

    while (cursor) {
      chain.push(cursor);

      if (!cursor.parentId) {
        break;
      }

      cursor = await this.prisma.node.findUnique({
        where: { id: cursor.parentId },
        select: {
          id: true,
          title: true,
          type: true,
          parentId: true,
          depth: true,
        },
      });

      if (!cursor) {
        break;
      }
    }

    const boards = await this.prisma.board.findMany({
      where: {
        nodeId: {
          in: chain.map((node) => node.id),
        },
      },
      select: {
        nodeId: true,
        id: true,
      },
    });

    const boardMap = new Map(boards.map((board) => [board.nodeId, board.id]));

    const items: NodeBreadcrumbItemDto[] = chain.reverse().map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      depth: node.depth,
      boardId: boardMap.get(node.id) ?? null,
    }));

    return {
      items,
    };
  }
  private async demoteToSimple(tx: Prisma.TransactionClient, node: NodeModel) {
    if (node.type === NodeType.COMPLEX) {
      const childCount = await tx.node.count({ where: { parentId: node.id } });
      if (childCount > 0) {
        throw new BadRequestException(
          'Impossible de convertir : le kanban possede encore des sous-taches',
        );
      }
      await tx.column.deleteMany({ where: { board: { nodeId: node.id } } });
      await tx.board.deleteMany({ where: { nodeId: node.id } });
    }

    await tx.checklistItem.deleteMany({
      where: { checklist: { nodeId: node.id } },
    });
    await tx.checklist.deleteMany({ where: { nodeId: node.id } });

    return tx.node.update({
      where: { id: node.id },
      data: {
        type: NodeType.SIMPLE,
        statusMetadata: Prisma.JsonNull,
      },
    });
  }

  private async ensureDefaultColumnBehaviors(
    tx: Prisma.TransactionClient,
    teamId: string,
  ) {
    const behaviors = await tx.columnBehavior.findMany({
      where: {
        teamId,
        key: {
          in: [
            ColumnBehaviorKey.BACKLOG,
            ColumnBehaviorKey.IN_PROGRESS,
            ColumnBehaviorKey.BLOCKED,
            ColumnBehaviorKey.DONE,
          ],
        },
      },
    });

    const map = new Map(behaviors.map((b) => [b.key, b]));

    const defaults = [
      { key: ColumnBehaviorKey.BACKLOG, label: 'Backlog', color: '#6b7280' },
      {
        key: ColumnBehaviorKey.IN_PROGRESS,
        label: 'En cours',
        color: '#2563eb',
      },
      { key: ColumnBehaviorKey.BLOCKED, label: 'Bloque', color: '#f97316' },
      { key: ColumnBehaviorKey.DONE, label: 'Termine', color: '#16a34a' },
    ];

    for (const def of defaults) {
      if (!map.has(def.key)) {
        const created = await tx.columnBehavior.create({
          data: {
            teamId,
            key: def.key,
            label: def.label,
            color: def.color,
          },
        });
        map.set(def.key, created);
      }
    }

    return map;
  }

  private async createDefaultColumns(
    tx: Prisma.TransactionClient,
    boardId: string,
    behaviors: Map<ColumnBehaviorKey, { id: string }>,
  ) {
    const definitions = [
      {
        key: ColumnBehaviorKey.BACKLOG,
        name: 'Backlog',
        position: 0,
        wipLimit: null,
      },
      {
        key: ColumnBehaviorKey.IN_PROGRESS,
        name: 'En cours',
        position: 1,
        wipLimit: 5,
      },
      {
        key: ColumnBehaviorKey.BLOCKED,
        name: 'Bloque',
        position: 2,
        wipLimit: null,
      },
      {
        key: ColumnBehaviorKey.DONE,
        name: 'Termine',
        position: 3,
        wipLimit: null,
      },
    ];

    for (const def of definitions) {
      const behavior = behaviors.get(def.key);
      if (!behavior) continue;

      await tx.column.create({
        data: {
          boardId,
          name: def.name,
          position: def.position,
          wipLimit: def.wipLimit,
          behaviorId: behavior.id,
        },
      });
    }
  }

  private mapNode(node: NodeModel): NodeDto {
    return {
      id: node.id,
      teamId: node.teamId,
      parentId: node.parentId,
      type: node.type,
      title: node.title,
      description: node.description,
      path: node.path,
      depth: node.depth,
      columnId: node.columnId,
      dueAt: node.dueAt ? node.dueAt.toISOString() : null,
      statusMetadata: normalizeJson(node.statusMetadata),
    };
  }
}
