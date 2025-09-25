import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ColumnBehaviorKey, MembershipStatus, Node as NodeModel, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { NodeDto } from './dto/node.dto';
import { NodeDetailDto } from './dto/node-detail.dto';
import { NodeAssignmentDto, NodeMinimalChildDto, NodeSummaryDto } from './dto/node-detail.dto';
import { NodeBreadcrumbDto } from './dto/node-breadcrumb.dto';
import { NodeBreadcrumbItemDto } from './dto/node-breadcrumb-item.dto';
import { NodeChildBoardDto } from './dto/node-child-board.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateChildNodeDto } from './dto/create-child-node.dto';
import { NodeSummaryOnlyDto } from './dto/node-summary-only.dto';

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

  // requestedType legacy supprime (types désormais implicites)

    // WIP limit (sur la colonne cible) avant creation
    if (column.wipLimit !== null) {
      const currentCount = await this.prisma.node.count({
        where: { columnId: column.id },
      });
      if (currentCount >= column.wipLimit) {
        throw new ConflictException('Limite WIP atteinte pour cette colonne');
      }
    }

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
          title: dto.title.trim(),
          description: dto.description ?? null,
          path: parent.path + '/' + newNodeId,
          depth: parent.depth + 1,
          position: (aggregate._max.position ?? 0) + 1,
          createdById: userId,
          dueAt,
        },
      });

      return created;
    });

    return this.mapNode(node);
  }

  // convertNode supprimé (endpoint retiré)

  async createChildNode(
    parentId: string,
    dto: CreateChildNodeDto,
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
      include: { board: { include: { columns: { include: { behavior: true } } } } },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);

    if (!dto.title?.trim()) throw new BadRequestException('Titre requis');

    const detail = await this.prisma.$transaction(async (tx) => {
      const { board, columns } = await this.ensureBoardWithColumns(tx, parent);
      const backlogColumn = columns.find(c => c.behavior.key === ColumnBehaviorKey.BACKLOG);
      if (!backlogColumn) throw new NotFoundException('Colonne backlog introuvable');

      if (backlogColumn.wipLimit !== null) {
        const currentCount = await tx.node.count({
          where: { parentId: parent.id, columnId: backlogColumn.id },
        });
        if (currentCount >= backlogColumn.wipLimit) {
          throw new ConflictException('Limite WIP atteinte (Backlog)');
        }
      }

      const aggregate = await tx.node.aggregate({
        where: { parentId: parent.id, columnId: backlogColumn.id },
        _max: { position: true },
      });

      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (dto.dueAt && Number.isNaN(dueAt?.getTime())) {
        throw new BadRequestException('Date de livraison invalide');
      }

      const newNodeId = randomUUID();
      await tx.node.create({
        data: {
          id: newNodeId,
          teamId: parent.teamId,
          parentId: parent.id,
          columnId: backlogColumn.id,
          title: dto.title.trim(),
          description: dto.description ?? null,
          path: parent.path + '/' + newNodeId,
          depth: parent.depth + 1,
          position: (aggregate._max.position ?? 0) + 1,
          createdById: userId,
          dueAt,
        },
      });
      // Recalcul progress parent (done/total)
      await this.recomputeParentProgress(tx, parent.id);
      return this.getNodeDetailUsing(tx, parent.id);
    });
    return detail;
  }

  async toggleChildDone(
    parentId: string,
    childId: string,
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
      include: { board: { include: { columns: { include: { behavior: true } } } } },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);

    const detail = await this.prisma.$transaction(async (tx) => {
      const { columns } = await this.ensureBoardWithColumns(tx, parent);
      const child = await tx.node.findUnique({ where: { id: childId } });
      if (!child || child.parentId !== parent.id)
        throw new NotFoundException('Sous-tache introuvable');

      // Trouver le comportement actuel de la sous-tâche
      const currentColumn = columns.find((c) => c.id === child.columnId);
      const behaviorKey = currentColumn?.behavior.key;
      
      // Determine target column based on current behavior
      let targetKey: ColumnBehaviorKey;
      if (behaviorKey === ColumnBehaviorKey.DONE) {
        // Currently DONE -> move to BACKLOG
        targetKey = ColumnBehaviorKey.BACKLOG;
      } else {
        // Currently BACKLOG, IN_PROGRESS, BLOCKED, or undefined -> move to DONE
        targetKey = ColumnBehaviorKey.DONE;
      }
      const targetColumn = columns.find((c) => c.behavior.key === targetKey);
  if (!targetColumn) throw new NotFoundException('Colonne cible introuvable');

      const aggregate = await tx.node.aggregate({
        where: { parentId: parent.id, columnId: targetColumn.id },
        _max: { position: true },
      });

      // Cycle time: mettre à jour statusMetadata child
      const statusMeta = normalizeJson(child.statusMetadata) || {};
      const nowIso = new Date().toISOString();
      if (targetKey === ColumnBehaviorKey.DONE) {
        if (!('doneAt' in statusMeta)) statusMeta.doneAt = nowIso;
        if (!('firstMovedAt' in statusMeta)) statusMeta.firstMovedAt = nowIso;
      } else if (targetKey === ColumnBehaviorKey.BACKLOG) {
        // On ne supprime pas doneAt si retour backlog
        if (!('firstMovedAt' in statusMeta)) statusMeta.firstMovedAt = nowIso;
      }
      await tx.node.update({
        where: { id: child.id },
        data: {
          columnId: targetColumn.id,
          position: (aggregate._max.position ?? 0) + 1,
          statusMetadata: statusMeta as any,
        },
      });
      await this.recomputeParentProgress(tx, parent.id);

      return this.getNodeDetailUsing(tx, parent.id);
    });
    return detail;
  }

  async updateChildNode(
    parentId: string,
    childId: string,
    dto: { title?: string | null; description?: string | null; dueAt?: string | null },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    const child = await this.prisma.node.findUnique({ where: { id: childId } });
    if (!child || child.parentId !== parent.id) throw new NotFoundException('Sous-tache introuvable');

    const data: Prisma.NodeUpdateInput = {};
    if (dto.title !== undefined) {
      const t = (dto.title ?? '').trim();
      if (!t) throw new BadRequestException('Titre requis');
      if (t.length > 200) throw new BadRequestException('Titre trop long');
      data.title = t;
    }
    if (dto.description !== undefined) {
      if (dto.description === null) data.description = null;
      else {
        if (dto.description.length > 50000) throw new BadRequestException('Description trop longue');
        data.description = dto.description;
      }
    }
    if (dto.dueAt !== undefined) {
      if (dto.dueAt === null) data.dueAt = null;
      else {
        const d = new Date(dto.dueAt);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('Date invalide');
        data.dueAt = d;
      }
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Aucun champ a mettre a jour');
    await this.prisma.node.update({ where: { id: child.id }, data });
    return this.getNodeDetail(parent.id);
  }

  async moveChildNode(
    parentId: string,
    childId: string,
    dto: { targetColumnId: string; position?: number },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    return this.prisma.$transaction(async (tx) => {
      const child = await tx.node.findUnique({ where: { id: childId } });
      if (!child || child.parentId !== parent.id) throw new NotFoundException('Sous-tache introuvable');
      const { columns } = await this.ensureBoardWithColumns(tx, parent);
      const targetColumn = columns.find(c => c.id === dto.targetColumnId);
      if (!targetColumn) throw new NotFoundException('Colonne cible introuvable');

      const sameColumn = child.columnId === targetColumn.id;
      // WIP enforcement: si on change de colonne et que la cible a une limite
      if (!sameColumn && targetColumn.wipLimit !== null) {
        const currentCount = await tx.node.count({
          where: { parentId: parent.id, columnId: targetColumn.id },
        });
        if (currentCount >= targetColumn.wipLimit) {
          throw new ConflictException('Limite WIP atteinte pour la colonne cible');
        }
      }
      // Fetch siblings of target column ordered
      const siblings = await tx.node.findMany({
        where: { parentId: parent.id, columnId: targetColumn.id },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      // Remove child if currently in target list (for reorder calc)
      const filtered = siblings.filter(s => s.id !== child.id);
      const maxIndex = filtered.length;
      let desired = dto.position ?? maxIndex;
      if (desired < 0) desired = 0;
      if (desired > maxIndex) desired = maxIndex;

      // If moving within same column, rebuild order with placeholder at desired
      let finalOrder: string[];
      if (sameColumn) {
        finalOrder = filtered.map(s => s.id);
        finalOrder.splice(desired, 0, child.id);
      } else {
        // Need also reindex old column removing child
        const oldSiblings = await tx.node.findMany({
          where: { parentId: parent.id, columnId: child.columnId ?? '' },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        const oldFiltered = oldSiblings.filter(s => s.id !== child.id);
        // Reindex old column
        for (let i = 0; i < oldFiltered.length; i++) {
          await tx.node.update({ where: { id: oldFiltered[i].id }, data: { position: i } });
        }
        finalOrder = filtered.map(s => s.id);
        finalOrder.splice(desired, 0, child.id);
      }
      // Apply updates target column
      // Determine if moving child to IN_PROGRESS or DONE for first time markers
      const targetBehavior = targetColumn.behavior.key;
      const childFull = await tx.node.findUnique({ where: { id: child.id } });
  let statusMeta = normalizeJson((childFull?.statusMetadata as any) ?? {}) || {};
      const nowIso = new Date().toISOString();
      if (targetBehavior === ColumnBehaviorKey.IN_PROGRESS) {
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso;
      } else if (targetBehavior === ColumnBehaviorKey.DONE) {
        if (!('doneAt' in statusMeta)) statusMeta.doneAt = nowIso;
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso; // fallback si jamais allé IN_PROGRESS
      }
      for (let i = 0; i < finalOrder.length; i++) {
        const id = finalOrder[i];
        await tx.node.update({ where: { id }, data: { position: i, columnId: targetColumn.id, statusMetadata: id === child.id ? statusMeta as any : undefined } });
      }
      await this.recomputeParentProgress(tx, parent.id);
      return this.getNodeDetailUsing(tx, parent.id);
    });
  }

  async reorderChildren(
    parentId: string,
    dto: { columnId: string; orderedIds: string[] },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    return this.prisma.$transaction(async (tx) => {
      const nodes = await tx.node.findMany({
        where: { parentId: parent.id, columnId: dto.columnId },
        select: { id: true },
      });
      const setExisting = new Set(nodes.map(n => n.id));
      const setProvided = new Set(dto.orderedIds);
      if (setExisting.size !== setProvided.size || [...setExisting].some(id => !setProvided.has(id))) {
        throw new BadRequestException('Liste ids incoherente');
      }
      for (let i = 0; i < dto.orderedIds.length; i++) {
        await tx.node.update({ where: { id: dto.orderedIds[i] }, data: { position: i } });
      }
      return this.getNodeDetail(parent.id);
    });
  }

  private async recomputeParentProgress(tx: Prisma.TransactionClient, parentId: string) {
    // Récupère enfants pour calculer done/total (DONE = comportement DONE)
    const children = await tx.node.findMany({
      where: { parentId },
      select: { id: true, column: { select: { behavior: { select: { key: true } } } } },
    });
    const total = children.length;
    if (total === 0) {
      await tx.node.update({ where: { id: parentId }, data: { progress: 0 } as any });
      return;
    }
    let done = 0;
    for (const c of children) {
      if (c.column?.behavior?.key === ColumnBehaviorKey.DONE) done++;
    }
    const pct = Math.round((done / total) * 100);
    await tx.node.update({ where: { id: parentId }, data: { progress: pct } as any });
  }

  async updateNode(
    nodeId: string,
    dto: UpdateNodeDto,
    userId: string,
  ): Promise<NodeDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.dueAt === undefined &&
      dto.progress === undefined &&
      dto.blockedReminderEmails === undefined &&
      dto.blockedReminderIntervalDays === undefined &&
      dto.blockedExpectedUnblockAt === undefined &&
      dto.priority === undefined &&
      dto.effort === undefined &&
      dto.tags === undefined
    ) {
      throw new BadRequestException('Aucun champ a mettre a jour');
    }

    const data: Prisma.NodeUpdateInput = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Le titre est obligatoire');
      if (title.length > 200)
        throw new BadRequestException('Titre trop long');
      data.title = title;
    }
    if (dto.description !== undefined) {
      if (dto.description === null) data.description = null;
      else {
        if (dto.description.length > 50000)
          throw new BadRequestException('Description trop longue');
        data.description = dto.description;
      }
    }
    if (dto.dueAt !== undefined) {
      if (dto.dueAt === null) data.dueAt = null;
      else {
        const dueAt = new Date(dto.dueAt);
        if (Number.isNaN(dueAt.getTime()))
          throw new BadRequestException('Date de livraison invalide');
        data.dueAt = dueAt;
      }
    }
    if (dto.progress !== undefined) {
      if (dto.progress === null || Number.isNaN(dto.progress)) {
        throw new BadRequestException('Progress invalide');
      }
      if (dto.progress < 0 || dto.progress > 100) {
        throw new BadRequestException('Progress hors limites (0-100)');
      }
  (data as any).progress = dto.progress; // cast car typings générés n'ont peut-être pas été régénérés encore
    }

    // Blocage
    if (dto.blockedReminderEmails !== undefined) {
      if (!Array.isArray(dto.blockedReminderEmails)) {
        throw new BadRequestException('blockedReminderEmails doit etre un tableau');
      }
      const cleaned = Array.from(new Set(dto.blockedReminderEmails.map(e=>String(e).trim().toLowerCase()).filter(Boolean)));
      const invalid = cleaned.filter(e=> !/.+@.+\..+/.test(e));
      if (invalid.length>0) throw new BadRequestException('Emails invalides: '+invalid.join(', '));
      (data as any).blockedReminderEmails = cleaned;
    }
    if (dto.blockedReminderIntervalDays !== undefined) {
      if (dto.blockedReminderIntervalDays === null) {
        (data as any).blockedReminderIntervalDays = null;
      } else {
        const v = Number(dto.blockedReminderIntervalDays);
        if (!Number.isInteger(v) || v < 1 || v > 365) throw new BadRequestException('blockedReminderIntervalDays invalide (1-365)');
        (data as any).blockedReminderIntervalDays = v;
      }
    }
    if (dto.blockedExpectedUnblockAt !== undefined) {
      if (dto.blockedExpectedUnblockAt === null) (data as any).blockedExpectedUnblockAt = null;
      else {
        const d = new Date(dto.blockedExpectedUnblockAt);
        if (Number.isNaN(d.getTime())) throw new BadRequestException('blockedExpectedUnblockAt invalide');
        (data as any).blockedExpectedUnblockAt = d;
      }
    }
    if (dto.priority !== undefined) {
      const set = new Set(['NONE','CRITICAL','HIGH','MEDIUM','LOW','LOWEST']);
      if (!set.has(dto.priority as any)) throw new BadRequestException('priority invalide');
      (data as any).priority = dto.priority as any;
    }
    if (dto.effort !== undefined) {
      if (dto.effort === null) (data as any).effort = null;
      else {
        const set = new Set(['UNDER2MIN','XS','S','M','L','XL','XXL']);
        if (!set.has(dto.effort as any)) throw new BadRequestException('effort invalide');
        (data as any).effort = dto.effort as any;
      }
    }
    if (dto.tags !== undefined) {
      if (!Array.isArray(dto.tags)) throw new BadRequestException('tags doit etre un tableau');
      const cleaned = dto.tags.map(t=>String(t).trim()).filter(t=>t.length>0);
      const uniq = Array.from(new Map(cleaned.map(t=>[t.toLowerCase(), t])).values());
      if (uniq.length > 20) throw new BadRequestException('Maximum 20 tags');
      for (const tag of uniq) {
        if (tag.length > 32) throw new BadRequestException('Tag trop long (>32)');
      }
      (data as any).tags = uniq;
    }

    const updated = await this.prisma.node.update({ where: { id: nodeId }, data });
    return this.mapNode(updated);
  }

  // Legacy checklist methods removed (deprecated endpoints now return 410 in controller)

  // recomputeChecklistProgress supprimé (legacy)

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

  // promoteToMedium removed (legacy)

  // promoteToComplex legacy supprimé

  async getNodeDetail(nodeId: string): Promise<NodeDetailDto> {
    return this.getNodeDetailUsing(this.prisma, nodeId);
  }

  private async getNodeDetailUsing(
    client: Prisma.TransactionClient | PrismaClient,
    nodeId: string,
  ): Promise<NodeDetailDto> {
    const node = await (client as any).node.findUnique({
      where: { id: nodeId },
      include: {
        assignments: true,
        children: {
          select: {
            id: true,
            title: true,
            columnId: true,
            column: { select: { id: true, behavior: { select: { key: true } } } },
          },
          orderBy: { position: 'asc' },
        },
        board: {
          select: { id: true, columns: { select: { id: true, behavior: { select: { key: true } } } } },
        },
      },
    });

    if (!node) {
      throw new NotFoundException();
    }

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
      behaviorKey: child.column?.behavior?.key,
      columnId: child.columnId,
    }));

    const summary: NodeSummaryDto | undefined = await this.buildSummary(node);
    const board = node.board ? {
      id: node.board.id,
      columns: node.board.columns.map((c:any) => ({ id: c.id, behaviorKey: c.behavior?.key ?? null }))
    } : undefined;

    return {
      ...this.mapNode(node),
      assignments,
      children,
      summary,
      board,
    };
  }

  private async buildSummary(node: any): Promise<NodeSummaryDto | undefined> {
    // If board exists -> aggregate by column behavior
    if (node.board) {
      const counts = { backlog: 0, inProgress: 0, blocked: 0, done: 0 };
      for (const child of node.children) {
        const key = child.column?.behavior?.key;
        switch (key) {
          case 'BACKLOG':
            counts.backlog++; break;
          case 'IN_PROGRESS':
            counts.inProgress++; break;
          case 'BLOCKED':
            counts.blocked++; break;
          case 'DONE':
            counts.done++; break;
        }
      }
      return { counts };
    }
    if (node.children.length > 0) {
      return {
        counts: {
          backlog: node.children.length,
          inProgress: 0,
          blocked: 0,
          done: 0,
        },
      };
    }
    return undefined;
  }
  async getNodeSummary(nodeId: string): Promise<NodeSummaryOnlyDto> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        children: {
          select: { id: true, column: { select: { behavior: { select: { key: true } } } } },
        },
        board: { select: { id: true, columns: { select: { id: true, behavior: { select: { key: true } } } } } },
      },
    });
    if (!node) throw new NotFoundException();
    const summary = await this.buildSummary(node);
    return {
      id: node.id,
      hasBoard: !!node.board,
      counts: summary?.counts || { backlog: 0, inProgress: 0, blocked: 0, done: 0 },
    };
  }
  async listChildBoards(nodeId: string): Promise<NodeChildBoardDto[]> {
    // Nouveau: on ne se base plus sur le type mais sur la présence d'un board
    const boards = await this.prisma.board.findMany({
      where: { node: { parentId: nodeId } },
      select: { id: true, node: { select: { id: true, title: true, position: true } } },
      orderBy: { node: { position: 'asc' } },
    });
    return boards.map(b => ({ nodeId: b.node.id, boardId: b.id, name: b.node.title }));
  }
  async getBreadcrumb(nodeId: string): Promise<NodeBreadcrumbDto> {
    const current = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        title: true,
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
      depth: node.depth,
      boardId: boardMap.get(node.id) ?? null,
    }));

    return {
      items,
    };
  }
  private async demoteToSimple(tx: Prisma.TransactionClient, node: NodeModel) {
  if (false) {
      const childCount = await tx.node.count({ where: { parentId: node.id } });
      if (childCount > 0) {
        throw new BadRequestException(
          'Impossible de convertir : le kanban possede encore des sous-taches',
        );
      }
      await tx.column.deleteMany({ where: { board: { nodeId: node.id } } });
      await tx.board.deleteMany({ where: { nodeId: node.id } });
    }

    // Legacy checklist déjà supprimée du schema

    return tx.node.update({
      where: { id: node.id },
      data: {
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
  // type supprimé
      title: node.title,
      description: node.description,
      path: node.path,
      depth: node.depth,
      columnId: node.columnId,
      dueAt: node.dueAt ? node.dueAt.toISOString() : null,
      statusMetadata: normalizeJson(node.statusMetadata),
      progress: (node as any).progress ?? 0,
      blockedReminderEmails: (node as any).blockedReminderEmails ?? [],
      blockedReminderIntervalDays: (node as any).blockedReminderIntervalDays ?? null,
      blockedExpectedUnblockAt: (node as any).blockedExpectedUnblockAt ? (node as any).blockedExpectedUnblockAt.toISOString?.() : null,
      priority: (node as any).priority ?? 'NONE',
      effort: (node as any).effort ?? null,
      tags: (node as any).tags ?? [],
    };
  }

  private async ensureBoardWithColumns(
    tx: Prisma.TransactionClient,
    parent: { id: string; teamId: string },
  ): Promise<{
    board: { id: string };
    columns: Array<{ id: string; behavior: { key: ColumnBehaviorKey }; wipLimit: number | null }>;
  }> {
    let board = await tx.board.findUnique({
      where: { nodeId: parent.id },
      include: { columns: { include: { behavior: true }, orderBy: { position: 'asc' } } },
    });
    if (!board) {
      const created = await tx.board.create({ data: { nodeId: parent.id } });
      const behaviors = await this.ensureDefaultColumnBehaviors(tx, parent.teamId);
      await this.createDefaultColumns(tx, created.id, behaviors);
      board = await tx.board.findUnique({
        where: { nodeId: parent.id },
        include: { columns: { include: { behavior: true }, orderBy: { position: 'asc' } } },
      });
    }
    if (!board) throw new BadRequestException('Echec creation board');
    return { board, columns: board.columns.map(c => ({ id: c.id, behavior: { key: c.behavior.key }, wipLimit: c.wipLimit })) };
  }
}
