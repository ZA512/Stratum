import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  ColumnBehaviorKey,
  MembershipStatus,
  Node as NodeModel,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateNodeDto } from './dto/create-node.dto';
import { NodeDto } from './dto/node.dto';
import { NodeDetailDto } from './dto/node-detail.dto';
import { CreateNodeCommentDto, NodeCommentDto } from './dto/node-comment.dto';
import {
  NodeAssignmentDto,
  NodeMinimalChildDto,
  NodeSummaryDto,
} from './dto/node-detail.dto';
import { NodeBreadcrumbDto } from './dto/node-breadcrumb.dto';
import { NodeBreadcrumbItemDto } from './dto/node-breadcrumb-item.dto';
import { NodeChildBoardDto } from './dto/node-child-board.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { CreateChildNodeDto } from './dto/create-child-node.dto';
import { NodeSummaryOnlyDto } from './dto/node-summary-only.dto';
import { NodeDeletePreviewDto } from './dto/node-delete-preview.dto';
import {
  InviteNodeCollaboratorDto,
  NodeShareCollaboratorDto,
  NodeShareSummaryDto,
} from './dto/node-share.dto';

function normalizeJson(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

const BILLING_STATUS_VALUES = new Set(['TO_BILL', 'BILLED', 'PAID']);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DEFAULT_BACKLOG_SETTINGS = Object.freeze({
  reviewAfterDays: 14,
  reviewEveryDays: 7,
  archiveAfterDays: 60,
});

const DEFAULT_DONE_SETTINGS = Object.freeze({
  archiveAfterDays: 30,
});

const DEFAULT_MAIL_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAIL_LOG_MAX_FILES = 5;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type RaciRole = 'R' | 'A' | 'C' | 'I';

type ShareCollaborator = {
  userId: string;
  addedById: string | null;
  addedAt: string | null;
};

type ShareInvitation = {
  email: string;
  invitedById: string | null;
  invitedAt: string | null;
  status: 'PENDING' | 'ACCEPTED';
};

type BacklogColumnSettings = {
  reviewAfterDays: number;
  reviewEveryDays: number;
  archiveAfterDays: number;
};

type DoneColumnSettings = {
  archiveAfterDays: number;
};

type MailRecipient = {
  userId: string | null;
  email: string;
  displayName: string;
};

type MailLogEntry = {
  id: string;
  timestamp: string;
  type:
    | 'node-comment-notification'
    | 'backlog-auto-archive'
    | 'backlog-review-reminder'
    | 'done-auto-archive'
    | 'blocked-auto-reminder';
  recipients?: MailRecipient[];
  node?: {
    id: string;
    title: string | null;
    parentId?: string | null;
  };
  [key: string]: any;
};

type MailPayload = {
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, any> | null;
};

type ExtractedMetadata = {
  raw: Record<string, any>;
  raci: {
    responsibleIds: string[];
    accountableIds: string[];
    consultedIds: string[];
    informedIds: string[];
  };
  timeTracking: {
    estimatedTimeHours: number | null;
    actualOpexHours: number | null;
    actualCapexHours: number | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    actualEndDate: string | null;
  };
  financials: {
    billingStatus: 'TO_BILL' | 'BILLED' | 'PAID' | null;
    hourlyRate: number | null;
    plannedBudget: number | null;
    consumedBudgetValue: number | null;
    consumedBudgetPercent: number | null;
    actualCost: number | null;
  };
  share: {
    collaborators: ShareCollaborator[];
    invitations: ShareInvitation[];
  };
  workflow: {
    backlog: {
      hiddenUntil: string | null;
      reviewStartedAt: string | null;
      lastInteractionAt: string | null;
      lastReminderAt: string | null;
      nextReviewAt: string | null;
      lastKnownColumnId: string | null;
      lastKnownBehavior: ColumnBehaviorKey | 'CUSTOM' | null;
    };
    done: {
      completedAt: string | null;
      archiveScheduledAt: string | null;
    };
  };
  workflowRaw: {
    backlog: Record<string, any>;
    done: Record<string, any>;
  };
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const set = new Set<string>();
  for (const entry of value) {
    if (entry === null || entry === undefined) continue;
    const str = String(entry).trim();
    if (str) set.add(str);
  }
  return Array.from(set.values());
}

function toNumberOrNull(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function toDateStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineHtml(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br />');
}

function formatDateTime(input: string | Date | null): string | null {
  if (!input) return null;
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  try {
    return date.toLocaleString('fr-FR', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

function toIsoDateTimeOrNull(value: unknown): string | null {
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
}

function normalizeShare(rawRoot: Record<string, any>): {
  collaborators: ShareCollaborator[];
  invitations: ShareInvitation[];
} {
  const shareRaw =
    rawRoot.share &&
    typeof rawRoot.share === 'object' &&
    !Array.isArray(rawRoot.share)
      ? { ...(rawRoot.share as Record<string, any>) }
      : {};

  const collaborators: ShareCollaborator[] = [];
  const collaboratorRaw = Array.isArray((shareRaw as any).collaborators)
    ? (shareRaw as any).collaborators
    : [];
  for (const entry of collaboratorRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const userIdRaw = entry.userId;
    const userId =
      typeof userIdRaw === 'string'
        ? userIdRaw.trim()
        : String(userIdRaw ?? '').trim();
    if (!userId) continue;
    const addedByIdRaw = entry.addedById;
    const addedById =
      typeof addedByIdRaw === 'string' && addedByIdRaw.trim()
        ? addedByIdRaw.trim()
        : null;
    const addedAtRaw = entry.addedAt;
    let addedAt: string | null = null;
    if (typeof addedAtRaw === 'string' && addedAtRaw.trim()) {
      const parsed = new Date(addedAtRaw);
      addedAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    collaborators.push({ userId, addedById, addedAt });
  }

  const invitations: ShareInvitation[] = [];
  const invitationsRaw = Array.isArray((shareRaw as any).invitations)
    ? (shareRaw as any).invitations
    : [];
  for (const entry of invitationsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const emailRaw = entry.email;
    const email =
      typeof emailRaw === 'string' ? emailRaw.trim().toLowerCase() : '';
    if (!email) continue;
    const invitedByRaw = entry.invitedById;
    const invitedById =
      typeof invitedByRaw === 'string' && invitedByRaw.trim()
        ? invitedByRaw.trim()
        : null;
    const invitedAtRaw = entry.invitedAt;
    let invitedAt: string | null = null;
    if (typeof invitedAtRaw === 'string' && invitedAtRaw.trim()) {
      const parsed = new Date(invitedAtRaw);
      invitedAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const statusRaw = entry.status;
    const status =
      typeof statusRaw === 'string' &&
      ['PENDING', 'ACCEPTED'].includes(statusRaw.toUpperCase())
        ? (statusRaw.toUpperCase() as 'PENDING' | 'ACCEPTED')
        : 'PENDING';
    invitations.push({ email, invitedById, invitedAt, status });
  }

  rawRoot.share = {
    collaborators: collaborators.map((collab) => ({
      userId: collab.userId,
      addedById: collab.addedById,
      addedAt: collab.addedAt,
    })),
    invitations: invitations.map((invite) => ({
      email: invite.email,
      invitedById: invite.invitedById,
      invitedAt: invite.invitedAt,
      status: invite.status,
    })),
  };

  return { collaborators, invitations };
}

function writeShareBack(metadata: ExtractedMetadata) {
  metadata.raw.share = {
    collaborators: metadata.share.collaborators.map((collab) => ({
      userId: collab.userId,
      addedById: collab.addedById,
      addedAt: collab.addedAt,
    })),
    invitations: metadata.share.invitations.map((invite) => ({
      email: invite.email,
      invitedById: invite.invitedById,
      invitedAt: invite.invitedAt,
      status: invite.status,
    })),
  };
}

@Injectable()
export class NodesService {
  private readonly logger = new Logger(NodesService.name);
  private workflowAutomationRunning = false;
  private readonly mailLogMaxBytes: number;
  private readonly mailLogMaxFiles: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {
    this.mailLogMaxBytes = this.resolveMailLogMaxBytes();
    this.mailLogMaxFiles = this.resolveMailLogMaxFiles();
  }

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
      // Décaler toutes les tâches existantes de +1 pour insérer en position 0
      await tx.node.updateMany({
        where: { parentId: parent.id, columnId: column.id },
        data: { position: { increment: 1 } },
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
          position: 0,
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
      include: {
        board: { include: { columns: { include: { behavior: true } } } },
      },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);

    if (!dto.title?.trim()) throw new BadRequestException('Titre requis');

    const detail = await this.prisma.$transaction(async (tx) => {
      const { columns } = await this.ensureBoardWithColumns(tx, parent);
      const backlogColumn = columns.find(
        (c) => c.behavior.key === ColumnBehaviorKey.BACKLOG,
      );
      if (!backlogColumn)
        throw new NotFoundException('Colonne backlog introuvable');

      const backlogSettings = this.normalizeBacklogSettings(
        backlogColumn.settings,
      );

      if (backlogColumn.wipLimit !== null) {
        const currentCount = await tx.node.count({
          where: { parentId: parent.id, columnId: backlogColumn.id },
        });
        if (currentCount >= backlogColumn.wipLimit) {
          throw new ConflictException('Limite WIP atteinte (Backlog)');
        }
      }

      // Décaler toutes les sous-tâches existantes de +1 pour insérer en position 0
      await tx.node.updateMany({
        where: { parentId: parent.id, columnId: backlogColumn.id },
        data: { position: { increment: 1 } },
      });

      const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (dto.dueAt && Number.isNaN(dueAt?.getTime())) {
        throw new BadRequestException('Date de livraison invalide');
      }

      const newNodeId = randomUUID();
      const now = new Date();
      const nowIso = now.toISOString();
      const metadataPayload: Prisma.InputJsonValue = {
        workflow: {
          backlog: {
            hiddenUntil: null,
            reviewStartedAt: nowIso,
            lastInteractionAt: nowIso,
            lastReminderAt: null,
            nextReviewAt: this.addDaysIso(now, backlogSettings.reviewAfterDays),
            lastKnownColumnId: backlogColumn.id,
            lastKnownBehavior: ColumnBehaviorKey.BACKLOG,
          },
          done: { completedAt: null, archiveScheduledAt: null },
        },
      };
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
          position: 0,
          createdById: userId,
          dueAt,
          metadata: metadataPayload,
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
      include: {
        board: { include: { columns: { include: { behavior: true } } } },
      },
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
      if (!targetColumn)
        throw new NotFoundException('Colonne cible introuvable');

      if (
        targetKey === ColumnBehaviorKey.DONE &&
        behaviorKey !== ColumnBehaviorKey.DONE
      ) {
        await this.ensureNodeCanEnterDone(tx, child.id);
      }

      const aggregate = await tx.node.aggregate({
        where: { parentId: parent.id, columnId: targetColumn.id },
        _max: { position: true },
      });

      // Cycle time: mettre à jour statusMetadata child
      const statusMeta = normalizeJson(child.statusMetadata) || {};
      const now = new Date();
      const nowIso = now.toISOString();
      if (targetKey === ColumnBehaviorKey.DONE) {
        if (!('doneAt' in statusMeta)) statusMeta.doneAt = nowIso;
        if (!('firstMovedAt' in statusMeta)) statusMeta.firstMovedAt = nowIso;
      } else if (targetKey === ColumnBehaviorKey.BACKLOG) {
        // On ne supprime pas doneAt si retour backlog
        if (!('firstMovedAt' in statusMeta)) statusMeta.firstMovedAt = nowIso;
      }
      const blockedTransitionUpdate = this.buildBlockedTransitionUpdate(
        behaviorKey ?? null,
        targetKey,
      );
      const workflowUpdate = this.buildWorkflowTransitionUpdate(
        child as NodeModel,
        targetColumn,
        now,
      );
      await tx.node.update({
        where: { id: child.id },
        data: {
          column: { connect: { id: targetColumn.id } },
          position: (aggregate._max.position ?? 0) + 1,
          statusMetadata: statusMeta as any,
          ...blockedTransitionUpdate,
          ...workflowUpdate,
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
    dto: {
      title?: string | null;
      description?: string | null;
      dueAt?: string | null;
    },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    const child = await this.prisma.node.findUnique({ where: { id: childId } });
    if (!child || child.parentId !== parent.id)
      throw new NotFoundException('Sous-tache introuvable');

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
        if (dto.description.length > 50000)
          throw new BadRequestException('Description trop longue');
        data.description = dto.description;
      }
    }
    if (dto.dueAt !== undefined) {
      if (dto.dueAt === null) data.dueAt = null;
      else {
        const d = new Date(dto.dueAt);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('Date invalide');
        data.dueAt = d;
      }
    }
    if (Object.keys(data).length === 0)
      throw new BadRequestException('Aucun champ a mettre a jour');
    await this.prisma.node.update({ where: { id: child.id }, data });
    return this.getNodeDetail(parent.id);
  }

  async moveChildNode(
    parentId: string,
    childId: string,
    dto: { targetColumnId: string; position?: number },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    return this.prisma.$transaction(async (tx) => {
      const child = await tx.node.findUnique({ where: { id: childId } });
      if (!child || child.parentId !== parent.id)
        throw new NotFoundException('Sous-tache introuvable');
      const { columns } = await this.ensureBoardWithColumns(tx, parent);
      const targetColumn = columns.find((c) => c.id === dto.targetColumnId);
      if (!targetColumn)
        throw new NotFoundException('Colonne cible introuvable');

      const sameColumn = child.columnId === targetColumn.id;
      // WIP enforcement: si on change de colonne et que la cible a une limite
      if (!sameColumn && targetColumn.wipLimit !== null) {
        const currentCount = await tx.node.count({
          where: { parentId: parent.id, columnId: targetColumn.id },
        });
        if (currentCount >= targetColumn.wipLimit) {
          throw new ConflictException(
            'Limite WIP atteinte pour la colonne cible',
          );
        }
      }
      // Fetch siblings of target column ordered
      const siblings = await tx.node.findMany({
        where: { parentId: parent.id, columnId: targetColumn.id },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      // Remove child if currently in target list (for reorder calc)
      const filtered = siblings.filter((s) => s.id !== child.id);
      const maxIndex = filtered.length;
      let desired = dto.position ?? maxIndex;
      if (desired < 0) desired = 0;
      if (desired > maxIndex) desired = maxIndex;

      // If moving within same column, rebuild order with placeholder at desired
      let finalOrder: string[];
      if (sameColumn) {
        finalOrder = filtered.map((s) => s.id);
        finalOrder.splice(desired, 0, child.id);
      } else {
        // Need also reindex old column removing child
        const oldSiblings = await tx.node.findMany({
          where: { parentId: parent.id, columnId: child.columnId ?? '' },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        const oldFiltered = oldSiblings.filter((s) => s.id !== child.id);
        // Reindex old column
        for (let i = 0; i < oldFiltered.length; i++) {
          await tx.node.update({
            where: { id: oldFiltered[i].id },
            data: { position: i },
          });
        }
        finalOrder = filtered.map((s) => s.id);
        finalOrder.splice(desired, 0, child.id);
      }
      // Apply updates target column
      // Determine if moving child to IN_PROGRESS or DONE for first time markers
      const targetBehavior = targetColumn.behavior.key;
      const statusMeta = normalizeJson(child.statusMetadata ?? {}) || {};
      const now = new Date();
      const nowIso = now.toISOString();
      if (targetBehavior === ColumnBehaviorKey.IN_PROGRESS) {
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso;
      } else if (targetBehavior === ColumnBehaviorKey.DONE) {
        if (!sameColumn) {
          await this.ensureNodeCanEnterDone(tx, child.id);
        }
        if (!('doneAt' in statusMeta)) statusMeta.doneAt = nowIso;
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso; // fallback si jamais allé IN_PROGRESS
      }
      const currentBehavior = columns.find((c) => c.id === child.columnId)?.behavior
        ?.key;
      const blockedTransitionUpdate = sameColumn
        ? {}
        : this.buildBlockedTransitionUpdate(
            currentBehavior ?? null,
            targetBehavior,
          );
      const workflowUpdate = sameColumn
        ? {}
        : this.buildWorkflowTransitionUpdate(
            child as NodeModel,
            targetColumn,
            now,
          );
      for (let i = 0; i < finalOrder.length; i++) {
        const id = finalOrder[i];
        const data: Prisma.NodeUpdateInput = {
          position: i,
          column: { connect: { id: targetColumn.id } },
        };
        if (id === child.id) {
          data.statusMetadata = statusMeta as any;
          Object.assign(data, blockedTransitionUpdate, workflowUpdate);
        }
        await tx.node.update({
          where: { id },
          data,
        });
      }
      await this.recomputeParentProgress(tx, parent.id);
      return this.getNodeDetailUsing(tx, parent.id);
    });
  }

  async moveNodeToBoard(
    nodeId: string,
    dto: { targetBoardId: string; targetColumnId: string; position?: number },
    userId: string,
  ): Promise<NodeDto> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        teamId: true,
        parentId: true,
        columnId: true,
        position: true,
        path: true,
        depth: true,
        statusMetadata: true,
      },
    });
    if (!node) throw new NotFoundException('Tâche introuvable');
    await this.ensureUserCanWrite(node.teamId, userId);

    const board = await this.prisma.board.findUnique({
      where: { id: dto.targetBoardId },
      include: {
        node: { select: { id: true, path: true, depth: true, teamId: true } },
        columns: {
          select: {
            id: true,
            position: true,
            wipLimit: true,
            behavior: { select: { key: true } },
          },
        },
      },
    });
    if (!board || !board.node)
      throw new NotFoundException('Board cible introuvable');

    await this.ensureUserCanWrite(board.node.teamId, userId);

    if (board.node.teamId !== node.teamId) {
      throw new BadRequestException(
        'Déplacement vers une autre équipe non supporté',
      );
    }

    if (
      board.node.id === node.id ||
      board.node.path.startsWith(node.path + '/')
    ) {
      throw new BadRequestException(
        'Impossible de déplacer une tâche dans son propre sous-kanban',
      );
    }

    const targetColumn = board.columns.find(
      (column) => column.id === dto.targetColumnId,
    );
    if (!targetColumn) throw new NotFoundException('Colonne cible introuvable');

    if (node.parentId === board.node.id && node.columnId === targetColumn.id) {
      await this.moveChildNode(
        board.node.id,
        node.id,
        { targetColumnId: targetColumn.id, position: dto.position },
        userId,
      );
      const refreshed = await this.prisma.node.findUnique({
        where: { id: node.id },
      });
      if (!refreshed) throw new NotFoundException('Tâche introuvable');
      return this.mapNode(refreshed);
    }

    return this.prisma.$transaction(async (tx) => {
      const freshNode = await tx.node.findUnique({
        where: { id: node.id },
        select: {
          id: true,
          teamId: true,
          parentId: true,
          columnId: true,
          position: true,
          path: true,
          depth: true,
          statusMetadata: true,
          metadata: true,
        },
      });
      if (!freshNode) throw new NotFoundException('Tâche introuvable');
      if (!freshNode.columnId)
        throw new BadRequestException('Colonne source introuvable');

      if (targetColumn.wipLimit !== null) {
        const count = await tx.node.count({
          where: { parentId: board.node.id, columnId: targetColumn.id },
        });
        if (count >= targetColumn.wipLimit) {
          throw new ConflictException(
            'Limite WIP atteinte pour la colonne cible',
          );
        }
      }

      const sourceParentId = freshNode.parentId;
      const sourceColumnId = freshNode.columnId;
      const sourcePath = freshNode.path;
      const sourceDepth = freshNode.depth;

      const descendants = await tx.node.findMany({
        where: { path: { startsWith: sourcePath + '/' } },
        select: { id: true, path: true, depth: true },
      });

      const siblingsTarget = await tx.node.findMany({
        where: { parentId: board.node.id, columnId: targetColumn.id },
        select: { id: true, position: true },
        orderBy: { position: 'asc' },
      });
      const filteredTarget = siblingsTarget.filter(
        (sibling) => sibling.id !== node.id,
      );

      let targetPosition =
        dto.position !== undefined
          ? Math.floor(dto.position)
          : filteredTarget.length;
      if (targetPosition < 0) targetPosition = 0;
      if (targetPosition > filteredTarget.length)
        targetPosition = filteredTarget.length;

      for (let index = filteredTarget.length - 1; index >= 0; index--) {
        const sibling = filteredTarget[index];
        if (sibling.position >= targetPosition) {
          await tx.node.update({
            where: { id: sibling.id },
            data: { position: sibling.position + 1 },
          });
        }
      }

      if (sourceParentId) {
        const sourceSiblings = await tx.node.findMany({
          where: { parentId: sourceParentId, columnId: sourceColumnId },
          select: { id: true, position: true },
          orderBy: { position: 'asc' },
        });
        let nextPosition = 0;
        for (const sibling of sourceSiblings) {
          if (sibling.id === node.id) continue;
          if (sibling.position !== nextPosition) {
            await tx.node.update({
              where: { id: sibling.id },
              data: { position: nextPosition },
            });
          }
          nextPosition++;
        }
      }

      const newPath = `${board.node.path}/${node.id}`;
      const depthDelta = board.node.depth + 1 - sourceDepth;

      const statusMeta = normalizeJson(freshNode.statusMetadata) || {};
      const now = new Date();
      const nowIso = now.toISOString();
      const behaviorKey = targetColumn.behavior.key;
      const sourceBehavior = freshNode.columnId
        ? (
            await tx.column.findUnique({
              where: { id: freshNode.columnId },
              include: { behavior: true },
            })
          )?.behavior.key ?? null
        : null;
      if (behaviorKey === ColumnBehaviorKey.IN_PROGRESS) {
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso;
      } else if (behaviorKey === ColumnBehaviorKey.DONE) {
        await this.ensureNodeCanEnterDone(tx, freshNode.id);
        if (!('doneAt' in statusMeta)) statusMeta.doneAt = nowIso;
        if (!('startedAt' in statusMeta)) statusMeta.startedAt = nowIso;
      }
      const blockedTransitionUpdate = this.buildBlockedTransitionUpdate(
        sourceBehavior,
        behaviorKey,
      );
      const workflowUpdate = this.buildWorkflowTransitionUpdate(
        freshNode as unknown as NodeModel,
        {
          id: targetColumn.id,
          behavior: { key: behaviorKey },
          settings: this.normalizeColumnSettings((targetColumn as any).settings ?? null),
        },
        now,
      );

      const updated = await tx.node.update({
        where: { id: node.id },
        data: {
          parent: { connect: { id: board.node.id } },
          team: { connect: { id: board.node.teamId } },
          column: { connect: { id: targetColumn.id } },
          position: targetPosition,
          path: newPath,
          depth: board.node.depth + 1,
          statusMetadata: statusMeta as any,
          ...blockedTransitionUpdate,
          ...workflowUpdate,
        },
      });

      const oldPrefix = sourcePath + '/';
      const newPrefix = newPath + '/';
      for (const descendant of descendants) {
        const suffix = descendant.path.slice(oldPrefix.length);
        const updatedPath = newPrefix + suffix;
        await tx.node.update({
          where: { id: descendant.id },
          data: {
            path: updatedPath,
            depth: descendant.depth + depthDelta,
            teamId: board.node.teamId,
          },
        });
      }

      await this.recomputeParentProgress(tx, board.node.id);
      if (sourceParentId && sourceParentId !== board.node.id) {
        try {
          await this.recomputeParentProgress(tx, sourceParentId);
        } catch {
          /* parent possiblement supprimé */
        }
      }

      return this.mapNode(updated);
    });
  }

  async reorderChildren(
    parentId: string,
    dto: { columnId: string; orderedIds: string[] },
    userId: string,
  ): Promise<NodeDetailDto> {
    const parent = await this.prisma.node.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new NotFoundException('Parent introuvable');
    await this.ensureUserCanWrite(parent.teamId, userId);
    return this.prisma.$transaction(async (tx) => {
      const nodes = await tx.node.findMany({
        where: { parentId: parent.id, columnId: dto.columnId },
        select: { id: true },
      });
      const setExisting = new Set(nodes.map((n) => n.id));
      const setProvided = new Set(dto.orderedIds);
      if (
        setExisting.size !== setProvided.size ||
        [...setExisting].some((id) => !setProvided.has(id))
      ) {
        throw new BadRequestException('Liste ids incoherente');
      }
      for (let i = 0; i < dto.orderedIds.length; i++) {
        await tx.node.update({
          where: { id: dto.orderedIds[i] },
          data: { position: i },
        });
      }
      return this.getNodeDetail(parent.id);
    });
  }

  private async recomputeParentProgress(
    tx: Prisma.TransactionClient,
    parentId: string,
  ) {
    // Récupère enfants pour calculer done/total (DONE = comportement DONE)
    const children = await tx.node.findMany({
      where: { parentId },
      select: {
        id: true,
        column: { select: { behavior: { select: { key: true } } } },
      },
    });
    const total = children.length;
    if (total === 0) {
      await tx.node.update({
        where: { id: parentId },
        data: { progress: 0 } as any,
      });
      return;
    }
    let done = 0;
    for (const c of children) {
      if (c.column?.behavior?.key === ColumnBehaviorKey.DONE) done++;
    }
    const pct = Math.round((done / total) * 100);
    await tx.node.update({
      where: { id: parentId },
      data: { progress: pct } as any,
    });
  }

  private buildBlockedTransitionUpdate(
    sourceBehavior: ColumnBehaviorKey | null,
    targetBehavior: ColumnBehaviorKey,
  ): Prisma.NodeUpdateInput {
    const update: Prisma.NodeUpdateInput = {};
    if (
      sourceBehavior === ColumnBehaviorKey.BLOCKED &&
      targetBehavior !== ColumnBehaviorKey.BLOCKED
    ) {
      (update as any).blockedReason = null;
      (update as any).blockedReminderEmails = [];
      (update as any).blockedReminderIntervalDays = null;
      (update as any).blockedReminderLastSentAt = null;
      (update as any).blockedExpectedUnblockAt = null;
      (update as any).blockedSince = null;
      (update as any).isBlockResolved = false;
    }
    if (
      sourceBehavior !== ColumnBehaviorKey.BLOCKED &&
      targetBehavior === ColumnBehaviorKey.BLOCKED
    ) {
      (update as any).blockedSince = new Date();
      (update as any).isBlockResolved = false;
      (update as any).blockedReminderLastSentAt = null;
    }
    return update;
  }

  private buildWorkflowTransitionUpdate(
    node: NodeModel,
    targetColumn: {
      id: string;
      behavior: { key: ColumnBehaviorKey };
      settings: Record<string, any> | null;
    },
    now: Date,
  ): Prisma.NodeUpdateInput {
    const extracted = this.extractMetadata(node);
    const workflowState = extracted.workflow;
    const workflowRaw = extracted.workflowRaw;
    let changed = false;
    const nowIso = now.toISOString();

    if (workflowState.backlog.lastKnownColumnId !== targetColumn.id) {
      workflowState.backlog.lastKnownColumnId = targetColumn.id;
      workflowRaw.backlog.lastKnownColumnId = targetColumn.id;
      changed = true;
    }
    if (workflowState.backlog.lastKnownBehavior !== targetColumn.behavior.key) {
      workflowState.backlog.lastKnownBehavior = targetColumn.behavior.key;
      workflowRaw.backlog.lastKnownBehavior = targetColumn.behavior.key;
      changed = true;
    }

    if (targetColumn.behavior.key === ColumnBehaviorKey.BACKLOG) {
      const backlogSettings = this.normalizeBacklogSettings(targetColumn.settings);
      const nextReview = this.addDaysIso(now, backlogSettings.reviewAfterDays);
      if (workflowState.backlog.hiddenUntil !== null) {
        workflowState.backlog.hiddenUntil = null;
        workflowRaw.backlog.hiddenUntil = null;
        changed = true;
      }
      if (workflowState.backlog.reviewStartedAt !== nowIso) {
        workflowState.backlog.reviewStartedAt = nowIso;
        workflowRaw.backlog.reviewStartedAt = nowIso;
        changed = true;
      }
      if (workflowState.backlog.lastInteractionAt !== nowIso) {
        workflowState.backlog.lastInteractionAt = nowIso;
        workflowRaw.backlog.lastInteractionAt = nowIso;
        changed = true;
      }
      if (workflowState.backlog.lastReminderAt !== null) {
        workflowState.backlog.lastReminderAt = null;
        workflowRaw.backlog.lastReminderAt = null;
        changed = true;
      }
      if (workflowState.backlog.nextReviewAt !== nextReview) {
        workflowState.backlog.nextReviewAt = nextReview;
        workflowRaw.backlog.nextReviewAt = nextReview;
        changed = true;
      }
    } else {
      if (workflowState.backlog.reviewStartedAt !== null) {
        workflowState.backlog.reviewStartedAt = null;
        workflowRaw.backlog.reviewStartedAt = null;
        changed = true;
      }
      if (workflowState.backlog.nextReviewAt !== null) {
        workflowState.backlog.nextReviewAt = null;
        workflowRaw.backlog.nextReviewAt = null;
        changed = true;
      }
      if (workflowState.backlog.hiddenUntil !== null) {
        workflowState.backlog.hiddenUntil = null;
        workflowRaw.backlog.hiddenUntil = null;
        changed = true;
      }
      if (workflowState.backlog.lastReminderAt !== null) {
        workflowState.backlog.lastReminderAt = null;
        workflowRaw.backlog.lastReminderAt = null;
        changed = true;
      }
    }

    if (targetColumn.behavior.key === ColumnBehaviorKey.DONE) {
      const doneSettings = this.normalizeDoneSettings(targetColumn.settings);
      if (!workflowState.done.completedAt) {
        workflowState.done.completedAt = nowIso;
        workflowRaw.done.completedAt = nowIso;
        changed = true;
      }
      const archiveAt =
        doneSettings.archiveAfterDays > 0
          ? this.addDaysIso(now, doneSettings.archiveAfterDays)
          : null;
      if (workflowState.done.archiveScheduledAt !== archiveAt) {
        workflowState.done.archiveScheduledAt = archiveAt;
        workflowRaw.done.archiveScheduledAt = archiveAt;
        changed = true;
      }
    } else if (workflowState.done.archiveScheduledAt !== null) {
      workflowState.done.archiveScheduledAt = null;
      workflowRaw.done.archiveScheduledAt = null;
      changed = true;
    }

    if (!changed) {
      return {};
    }

    extracted.raw.workflow = {
      backlog: { ...workflowRaw.backlog },
      done: { ...workflowRaw.done },
    };

    return {
      metadata: extracted.raw as Prisma.InputJsonValue,
    };
  }

  private async countIncompleteDescendants(
    tx: Prisma.TransactionClient,
    nodeId: string,
  ): Promise<number> {
    let count = 0;
    const stack: string[] = [nodeId];
    while (stack.length > 0) {
      const currentId = stack.pop()!;
      const children = await tx.node.findMany({
        where: { parentId: currentId, archivedAt: null },
        select: {
          id: true,
          column: { select: { behavior: { select: { key: true } } } },
        },
      });
      for (const child of children) {
        const childBehavior = child.column?.behavior?.key ?? null;
        if (childBehavior !== ColumnBehaviorKey.DONE) {
          count += 1;
        }
        stack.push(child.id);
      }
    }
    return count;
  }

  private async ensureNodeCanEnterDone(
    tx: Prisma.TransactionClient,
    nodeId: string,
  ): Promise<void> {
    const unfinished = await this.countIncompleteDescendants(tx, nodeId);
    if (unfinished > 0) {
      throw new ConflictException({
        message: `Impossible de terminer la tache : ${unfinished} sous-tache(s) non terminee(s)`,
        code: 'NODE_HAS_ACTIVE_CHILDREN',
        incompleteChildrenCount: unfinished,
      });
    }
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
      dto.blockedReason === undefined &&
      dto.blockedReminderEmails === undefined &&
      dto.blockedReminderIntervalDays === undefined &&
      dto.blockedExpectedUnblockAt === undefined &&
      dto.blockedSince === undefined &&
      dto.isBlockResolved === undefined &&
      dto.priority === undefined &&
      dto.effort === undefined &&
      dto.tags === undefined &&
      dto.raciResponsibleIds === undefined &&
      dto.raciAccountableIds === undefined &&
      dto.raciConsultedIds === undefined &&
      dto.raciInformedIds === undefined &&
      dto.estimatedTimeHours === undefined &&
      dto.actualOpexHours === undefined &&
      dto.actualCapexHours === undefined &&
      dto.plannedStartDate === undefined &&
      dto.plannedEndDate === undefined &&
      dto.actualEndDate === undefined &&
      dto.billingStatus === undefined &&
      dto.hourlyRate === undefined &&
      dto.plannedBudget === undefined &&
      dto.consumedBudgetValue === undefined &&
      dto.consumedBudgetPercent === undefined &&
      dto.backlogHiddenUntil === undefined &&
      dto.backlogReviewRestart === undefined &&
      dto.archivedAt === undefined
    ) {
      throw new BadRequestException('Aucun champ a mettre a jour');
    }

    const data: Prisma.NodeUpdateInput = {};

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Le titre est obligatoire');
      if (title.length > 200) throw new BadRequestException('Titre trop long');
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
    if (dto.blockedReason !== undefined) {
      if (dto.blockedReason === null) {
        (data as any).blockedReason = null;
      } else {
        const reason = dto.blockedReason.trim();
        if (reason.length > 5000)
          throw new BadRequestException('blockedReason trop long (max 5000)');
        (data as any).blockedReason = reason;
      }
    }
    if (dto.blockedReminderEmails !== undefined) {
      if (!Array.isArray(dto.blockedReminderEmails)) {
        throw new BadRequestException(
          'blockedReminderEmails doit etre un tableau',
        );
      }
      const cleaned = Array.from(
        new Set(
          dto.blockedReminderEmails
            .map((e) => String(e).trim().toLowerCase())
            .filter(Boolean),
        ),
      );
      const invalid = cleaned.filter((e) => !/.+@.+\..+/.test(e));
      if (invalid.length > 0)
        throw new BadRequestException(
          'Emails invalides: ' + invalid.join(', '),
        );
      (data as any).blockedReminderEmails = cleaned;
    }
    if (dto.blockedReminderIntervalDays !== undefined) {
      if (dto.blockedReminderIntervalDays === null) {
        (data as any).blockedReminderIntervalDays = null;
        (data as any).blockedReminderLastSentAt = null;
      } else {
        const v = Number(dto.blockedReminderIntervalDays);
        if (!Number.isInteger(v) || v < 1 || v > 365)
          throw new BadRequestException(
            'blockedReminderIntervalDays invalide (1-365)',
          );
        (data as any).blockedReminderIntervalDays = v;
        (data as any).blockedReminderLastSentAt = null;
      }
    }
    if (dto.blockedExpectedUnblockAt !== undefined) {
      if (dto.blockedExpectedUnblockAt === null)
        (data as any).blockedExpectedUnblockAt = null;
      else {
        const d = new Date(dto.blockedExpectedUnblockAt);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('blockedExpectedUnblockAt invalide');
        (data as any).blockedExpectedUnblockAt = d;
      }
    }
    if (dto.blockedSince !== undefined) {
      if (dto.blockedSince === null) {
        (data as any).blockedSince = null;
      } else {
        const d = new Date(dto.blockedSince);
        if (Number.isNaN(d.getTime()))
          throw new BadRequestException('blockedSince invalide');
        (data as any).blockedSince = d;
      }
    }
    if (dto.isBlockResolved !== undefined) {
      (data as any).isBlockResolved = Boolean(dto.isBlockResolved);
    }
    if (dto.priority !== undefined) {
      const set = new Set([
        'NONE',
        'CRITICAL',
        'HIGH',
        'MEDIUM',
        'LOW',
        'LOWEST',
      ]);
      if (!set.has(dto.priority as any))
        throw new BadRequestException('priority invalide');
      (data as any).priority = dto.priority as any;
    }
    if (dto.effort !== undefined) {
      if (dto.effort === null) (data as any).effort = null;
      else {
        const set = new Set(['UNDER2MIN', 'XS', 'S', 'M', 'L', 'XL', 'XXL']);
        if (!set.has(dto.effort as any))
          throw new BadRequestException('effort invalide');
        (data as any).effort = dto.effort as any;
      }
    }
    if (dto.tags !== undefined) {
      if (!Array.isArray(dto.tags))
        throw new BadRequestException('tags doit etre un tableau');
      const cleaned = dto.tags
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);
      const uniq = Array.from(
        new Map(cleaned.map((t) => [t.toLowerCase(), t])).values(),
      );
      if (uniq.length > 20) throw new BadRequestException('Maximum 20 tags');
      for (const tag of uniq) {
        if (tag.length > 32)
          throw new BadRequestException('Tag trop long (>32)');
      }
      (data as any).tags = uniq;
    }

    const extractedMetadata = this.extractMetadata(node);
    const metadata: Record<string, any> = { ...extractedMetadata.raw };
    const nextRaci = {
      R: [...extractedMetadata.raci.responsibleIds],
      A: [...extractedMetadata.raci.accountableIds],
      C: [...extractedMetadata.raci.consultedIds],
      I: [...extractedMetadata.raci.informedIds],
    };
    const nextTimeTracking = { ...extractedMetadata.timeTracking };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { actualCost: _, ...financialStore } = extractedMetadata.financials;
    const nextFinancials = { ...financialStore };
    const workflowState = extractedMetadata.workflow;
    const workflowRaw = extractedMetadata.workflowRaw;

    let metadataChanged = false;
    let timeTrackingChanged = false;
    let financialsChanged = false;
    let workflowChanged = false;
    let shouldUpdateAssignments = false;

    const sanitizeIds = (value: string[] | undefined): string[] =>
      toStringArray(value ?? []);

    const parseHours = (
      value: number | null | undefined,
      field: string,
    ): number | null => {
      if (value === undefined) return null;
      if (value === null) return null;
      const parsed = toNumberOrNull(value);
      if (parsed === null) throw new BadRequestException(`${field} invalide`);
      if (parsed < 0)
        throw new BadRequestException(`${field} doit être positif`);
      return parsed;
    };

    const parseAmount = (
      value: number | null | undefined,
      field: string,
    ): number | null => {
      if (value === undefined) return null;
      if (value === null) return null;
      const parsed = toNumberOrNull(value);
      if (parsed === null) throw new BadRequestException(`${field} invalide`);
      if (parsed < 0)
        throw new BadRequestException(`${field} doit être positif`);
      return parsed;
    };

    if (dto.backlogHiddenUntil !== undefined) {
      const previous = workflowState.backlog.hiddenUntil;
      if (dto.backlogHiddenUntil === null) {
        if (previous !== null) {
          workflowState.backlog.hiddenUntil = null;
          workflowRaw.backlog.hiddenUntil = null;
          workflowChanged = true;
        }
      } else {
        const parsed = toIsoDateTimeOrNull(dto.backlogHiddenUntil);
        if (parsed === null)
          throw new BadRequestException('backlogHiddenUntil invalide');
        if (parsed !== previous) {
          workflowState.backlog.hiddenUntil = parsed;
          workflowRaw.backlog.hiddenUntil = parsed;
          workflowChanged = true;
        }
      }
    }

    if (dto.backlogReviewRestart) {
      const now = new Date();
      const nowIso = now.toISOString();
      workflowState.backlog.reviewStartedAt = nowIso;
      workflowState.backlog.lastInteractionAt = nowIso;
      workflowState.backlog.lastReminderAt = null;
      workflowRaw.backlog.reviewStartedAt = nowIso;
      workflowRaw.backlog.lastInteractionAt = nowIso;
      workflowRaw.backlog.lastReminderAt = null;
      if (workflowState.backlog.hiddenUntil !== null) {
        workflowState.backlog.hiddenUntil = null;
        workflowRaw.backlog.hiddenUntil = null;
        workflowChanged = true;
      }

      const candidateColumnId =
        node.columnId ?? workflowState.backlog.lastKnownColumnId;
      let nextReview: string | null = null;
      if (candidateColumnId) {
        const column = await this.prisma.column.findUnique({
          where: { id: candidateColumnId },
          include: { behavior: true },
        });
        if (column && column.behavior.key === ColumnBehaviorKey.BACKLOG) {
          const columnSettings = this.normalizeColumnSettings(
            (column as any).settings ?? null,
          );
          const backlogSettings = this.normalizeBacklogSettings(columnSettings);
          nextReview = this.addDaysIso(now, backlogSettings.reviewEveryDays);
          workflowState.backlog.lastKnownColumnId = column.id;
          workflowRaw.backlog.lastKnownColumnId = column.id;
          workflowState.backlog.lastKnownBehavior = column.behavior.key;
          workflowRaw.backlog.lastKnownBehavior = column.behavior.key;
        }
      }
      workflowState.backlog.nextReviewAt = nextReview;
      workflowRaw.backlog.nextReviewAt = nextReview;
      workflowChanged = true;
    }

    if (
      dto.raciResponsibleIds !== undefined ||
      dto.raciAccountableIds !== undefined ||
      dto.raciConsultedIds !== undefined ||
      dto.raciInformedIds !== undefined
    ) {
      shouldUpdateAssignments = true;
      const responsible =
        dto.raciResponsibleIds !== undefined
          ? sanitizeIds(dto.raciResponsibleIds)
          : nextRaci.R;
      const accountable =
        dto.raciAccountableIds !== undefined
          ? sanitizeIds(dto.raciAccountableIds)
          : nextRaci.A;
      const consulted =
        dto.raciConsultedIds !== undefined
          ? sanitizeIds(dto.raciConsultedIds)
          : nextRaci.C;
      const informed =
        dto.raciInformedIds !== undefined
          ? sanitizeIds(dto.raciInformedIds)
          : nextRaci.I;

      nextRaci.R = responsible;
      nextRaci.A = accountable;
      nextRaci.C = consulted;
      nextRaci.I = informed;
      metadata.raci = {
        R: responsible,
        A: accountable,
        C: consulted,
        I: informed,
      };
      metadataChanged = true;
    }

    if (dto.estimatedTimeHours !== undefined) {
      const value =
        dto.estimatedTimeHours === null
          ? null
          : parseHours(dto.estimatedTimeHours, 'Temps estimé');
      nextTimeTracking.estimatedTimeHours = value;
      timeTrackingChanged = true;
    }
    if (dto.actualOpexHours !== undefined) {
      const value =
        dto.actualOpexHours === null
          ? null
          : parseHours(dto.actualOpexHours, 'Temps réel OPEX');
      nextTimeTracking.actualOpexHours = value;
      timeTrackingChanged = true;
    }
    if (dto.actualCapexHours !== undefined) {
      const value =
        dto.actualCapexHours === null
          ? null
          : parseHours(dto.actualCapexHours, 'Temps réel CAPEX');
      nextTimeTracking.actualCapexHours = value;
      timeTrackingChanged = true;
    }
    if (dto.plannedStartDate !== undefined) {
      const parsed =
        dto.plannedStartDate === null
          ? null
          : toDateStringOrNull(dto.plannedStartDate);
      if (dto.plannedStartDate !== null && parsed === null)
        throw new BadRequestException('Date de début prévue invalide');
      nextTimeTracking.plannedStartDate = parsed;
      timeTrackingChanged = true;
    }
    if (dto.plannedEndDate !== undefined) {
      const parsed =
        dto.plannedEndDate === null
          ? null
          : toDateStringOrNull(dto.plannedEndDate);
      if (dto.plannedEndDate !== null && parsed === null)
        throw new BadRequestException('Date de fin prévue invalide');
      nextTimeTracking.plannedEndDate = parsed;
      timeTrackingChanged = true;
    }
    if (dto.actualEndDate !== undefined) {
      const parsed =
        dto.actualEndDate === null
          ? null
          : toDateStringOrNull(dto.actualEndDate);
      if (dto.actualEndDate !== null && parsed === null)
        throw new BadRequestException('Date de fin réelle invalide');
      nextTimeTracking.actualEndDate = parsed;
      timeTrackingChanged = true;
    }

    if (dto.billingStatus !== undefined) {
      if (
        dto.billingStatus !== null &&
        !BILLING_STATUS_VALUES.has(dto.billingStatus)
      ) {
        throw new BadRequestException('Statut de facturation invalide');
      }
      nextFinancials.billingStatus = dto.billingStatus ?? null;
      financialsChanged = true;
    }
    if (dto.hourlyRate !== undefined) {
      const value =
        dto.hourlyRate === null
          ? null
          : parseAmount(dto.hourlyRate, 'Taux horaire');
      nextFinancials.hourlyRate = value;
      financialsChanged = true;
    }
    if (dto.plannedBudget !== undefined) {
      const value =
        dto.plannedBudget === null
          ? null
          : parseAmount(dto.plannedBudget, 'Budget prévu');
      nextFinancials.plannedBudget = value;
      financialsChanged = true;
    }
    if (dto.consumedBudgetValue !== undefined) {
      const value =
        dto.consumedBudgetValue === null
          ? null
          : parseAmount(dto.consumedBudgetValue, 'Budget consommé');
      nextFinancials.consumedBudgetValue = value;
      financialsChanged = true;
    }
    if (dto.consumedBudgetPercent !== undefined) {
      const value =
        dto.consumedBudgetPercent === null
          ? null
          : parseAmount(dto.consumedBudgetPercent, 'Budget consommé (%)');
      nextFinancials.consumedBudgetPercent = value;
      financialsChanged = true;
    }

    if (dto.archivedAt !== undefined) {
      if (dto.archivedAt === null) {
        data.archivedAt = null;
      } else {
        const archivedAt = new Date(dto.archivedAt);
        if (Number.isNaN(archivedAt.getTime())) {
          throw new BadRequestException('Date d\'archivage invalide');
        }
        data.archivedAt = archivedAt;
        
        // Save the column ID in metadata so archived nodes can be counted by column
        if (node.columnId) {
          const workflowMeta = metadata.workflow || {};
          workflowMeta.lastKnownColumnId = node.columnId;
          metadata.workflow = workflowMeta;
          metadataChanged = true;
        }
      }
    }

    if (timeTrackingChanged) {
      metadata.timeTracking = { ...nextTimeTracking };
      metadataChanged = true;
    }
    if (financialsChanged) {
      metadata.financials = { ...nextFinancials };
      metadataChanged = true;
    }
    if (workflowChanged) {
      metadata.workflow = {
        backlog: { ...workflowRaw.backlog },
        done: { ...workflowRaw.done },
      };
      metadataChanged = true;
    }
    if (metadataChanged) {
      (data as any).metadata = metadata as Prisma.InputJsonValue;
    }

    const desiredRaci: Record<RaciRole, string[]> = {
      R: nextRaci.R,
      A: nextRaci.A,
      C: nextRaci.C,
      I: nextRaci.I,
    };

    const updated = shouldUpdateAssignments
      ? await this.prisma.$transaction(async (tx) => {
          const nodeUpdate = await tx.node.update({
            where: { id: nodeId },
            data,
          });
          await this.syncRaciAssignments(tx, nodeId, desiredRaci);
          return nodeUpdate;
        })
      : await this.prisma.node.update({
          where: { id: nodeId },
          data,
        });
    return this.mapNode(updated);
  }

  async deleteNode(
    nodeId: string,
    recursive: boolean,
    userId: string,
  ): Promise<void> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, teamId: true, parentId: true },
    });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    if (!recursive) {
      const childCount = await this.prisma.node.count({
        where: { parentId: node.id },
      });
      if (childCount > 0) {
        throw new BadRequestException(
          'Impossible de supprimer la tâche : des sous-tâches sont présentes. Choisissez la suppression récursive.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.node.delete({ where: { id: node.id } });
      if (node.parentId) {
        try {
          await this.recomputeParentProgress(tx, node.parentId);
        } catch {
          // Parent possiblement supprimé via cascade (suppression récursive)
        }
      }
    });
  }

  async restoreNode(nodeId: string, userId: string): Promise<NodeDto> {
    const archived = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        teamId: true,
        parentId: true,
        archivedAt: true,
      },
    });

    if (!archived) {
      throw new NotFoundException('Tâche introuvable');
    }

    if (!archived.archivedAt) {
      throw new BadRequestException('La tâche n\'est pas archivée');
    }

    await this.ensureUserCanWrite(archived.teamId, userId);

    if (!archived.parentId) {
      throw new BadRequestException(
        'Impossible de restaurer une tâche sans parent',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const freshNode = await tx.node.findUnique({
        where: { id: nodeId },
        select: {
          id: true,
          teamId: true,
          parentId: true,
          columnId: true,
          statusMetadata: true,
          metadata: true,
          archivedAt: true,
        },
      });

      if (!freshNode) {
        throw new NotFoundException('Tâche introuvable');
      }

      if (!freshNode.archivedAt) {
        throw new BadRequestException('La tâche n\'est pas archivée');
      }

      if (!freshNode.parentId) {
        throw new BadRequestException(
          'Impossible de restaurer une tâche sans parent',
        );
      }

      const parent = await tx.node.findUnique({
        where: { id: freshNode.parentId },
        select: { id: true, teamId: true },
      });

      if (!parent) {
        throw new NotFoundException('Parent introuvable');
      }

      const { columns } = await this.ensureBoardWithColumns(tx, parent);
      const metadata = this.extractMetadata(freshNode as unknown as NodeModel);
      const targetColumnId = metadata.workflow.backlog.lastKnownColumnId;

      if (!targetColumnId) {
        throw new BadRequestException(
          'Impossible de déterminer la colonne d’origine',
        );
      }

      const targetColumn = columns.find((column) => column.id === targetColumnId);

      if (!targetColumn) {
        throw new NotFoundException('Colonne cible introuvable');
      }

      if (targetColumn.behavior.key === ColumnBehaviorKey.DONE) {
        await this.ensureNodeCanEnterDone(tx, freshNode.id);
      }

      const siblings = await tx.node.findMany({
        where: {
          parentId: parent.id,
          columnId: targetColumn.id,
          archivedAt: null,
        },
        select: { id: true, position: true },
        orderBy: { position: 'asc' },
      });

      const nextPosition = siblings.length;
      const statusMeta: Record<string, unknown> =
        normalizeJson(freshNode.statusMetadata) ?? {};
      const now = new Date();
      const nowIso = now.toISOString();
      const behaviorKey = targetColumn.behavior.key;

      if (behaviorKey === ColumnBehaviorKey.IN_PROGRESS) {
        if (!('startedAt' in statusMeta)) {
          statusMeta.startedAt = nowIso;
        }
      } else if (behaviorKey === ColumnBehaviorKey.DONE) {
        if (!('doneAt' in statusMeta)) {
          statusMeta.doneAt = nowIso;
        }
        if (!('startedAt' in statusMeta)) {
          statusMeta.startedAt = nowIso;
        }
      }

      const previousBehavior =
        metadata.workflow.backlog.lastKnownBehavior === behaviorKey
          ? null
          : metadata.workflow.backlog.lastKnownBehavior;

      const blockedUpdate = this.buildBlockedTransitionUpdate(
        previousBehavior,
        behaviorKey,
      );

      const workflowUpdate = this.buildWorkflowTransitionUpdate(
        freshNode as unknown as NodeModel,
        targetColumn,
        now,
      );

      const updateData: Prisma.NodeUpdateInput = {
        archivedAt: null,
        column: { connect: { id: targetColumn.id } },
        position: nextPosition,
        statusMetadata: statusMeta as Prisma.InputJsonValue,
      };

      Object.assign(updateData, blockedUpdate, workflowUpdate);

      const updated = await tx.node.update({
        where: { id: freshNode.id },
        data: updateData,
      });

      await this.recomputeParentProgress(tx, parent.id);

      return this.mapNode(updated as unknown as NodeModel);
    });
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
    client: Prisma.TransactionClient,
    nodeId: string,
  ): Promise<NodeDetailDto> {
    const node = await client.node.findUnique({
      where: { id: nodeId },
      include: {
        assignments: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
        children: {
          select: {
            id: true,
            title: true,
            columnId: true,
            column: {
              select: { id: true, behavior: { select: { key: true } } },
            },
          },
          orderBy: { position: 'asc' },
        },
        board: {
          select: {
            id: true,
            columns: {
              select: { id: true, behavior: { select: { key: true } } },
            },
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!node) {
      throw new NotFoundException();
    }

    const assignmentsSource = node.assignments as Array<{
      id: string;
      userId: string;
      role: string | null;
      user: { displayName: string; avatarUrl: string | null } | null;
    }>;
    const assignments: NodeAssignmentDto[] = assignmentsSource.map(
      (assignment) => ({
        id: assignment.id,
        userId: assignment.userId,
        role: assignment.role ?? null,
        displayName: assignment.user?.displayName,
        avatarUrl: assignment.user?.avatarUrl ?? null,
      }),
    );

    const children: NodeMinimalChildDto[] = node.children.map((child) => ({
      id: child.id,
      title: child.title,
      behaviorKey: child.column?.behavior?.key,
      columnId: child.columnId,
    }));

    const summary: NodeSummaryDto | undefined = this.buildSummary(node);
    const board = node.board
      ? {
          id: node.board.id,
          columns: node.board.columns.map((c: any) => ({
            id: c.id,
            behaviorKey: c.behavior?.key ?? null,
          })),
        }
      : undefined;

    const comments = await this.mapCommentRecords(
      client,
      node.comments as unknown as Array<{
        id: string;
        nodeId: string;
        body: string;
        createdAt: Date;
        notifyResponsible: boolean;
        notifyAccountable: boolean;
        notifyConsulted: boolean;
        notifyInformed: boolean;
        notifyProject: boolean;
        notifySubProject: boolean;
        mentions: string[];
        author: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          email?: string | null;
        } | null;
      }>,
    );

    return {
      ...this.mapNode(node),
      assignments,
      children,
      summary,
      board,
      comments,
    };
  }

  private async mapCommentRecords(
    client: Prisma.TransactionClient | PrismaService,
    comments: Array<{
      id: string;
      nodeId: string;
      body: string;
      createdAt: Date;
      notifyResponsible: boolean;
      notifyAccountable: boolean;
      notifyConsulted: boolean;
      notifyInformed: boolean;
      notifyProject: boolean;
      notifySubProject: boolean;
      mentions: string[];
      author: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        email?: string | null;
      } | null;
    }>,
  ): Promise<NodeCommentDto[]> {
    if (!comments.length) return [];
    const mentionIds = new Set<string>();
    for (const comment of comments) {
      for (const mentionId of comment.mentions ?? []) {
        if (mentionId) mentionIds.add(mentionId);
      }
    }
    const mentionUsers = mentionIds.size
      ? await client.user.findMany({
          where: { id: { in: Array.from(mentionIds) } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const mentionMap = new Map(mentionUsers.map((user) => [user.id, user]));

    return comments.map((comment) => ({
      id: comment.id,
      nodeId: comment.nodeId,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      notify: {
        responsible: comment.notifyResponsible ?? true,
        accountable: comment.notifyAccountable ?? true,
        consulted: comment.notifyConsulted ?? true,
        informed: comment.notifyInformed ?? true,
        project: comment.notifyProject ?? false,
        subProject: comment.notifySubProject ?? false,
      },
      mentions: (comment.mentions ?? []).map((mentionId) => {
        const info = mentionMap.get(mentionId);
        return {
          userId: mentionId,
          displayName: info?.displayName ?? mentionId,
          email: info?.email ?? '',
        };
      }),
      author: {
        id: comment.author?.id ?? 'unknown',
        displayName:
          comment.author?.displayName ?? comment.author?.id ?? 'Utilisateur',
        avatarUrl: comment.author?.avatarUrl ?? null,
      },
    }));
  }

  private async dispatchCommentNotifications(
    node: NodeModel,
    comment: {
      id: string;
      body: string;
      notifyResponsible: boolean;
      notifyAccountable: boolean;
      notifyConsulted: boolean;
      notifyInformed: boolean;
      notifyProject: boolean;
      notifySubProject: boolean;
      mentions: string[];
      author: {
        id: string;
        displayName: string | null;
        email?: string | null;
      } | null;
    },
  ): Promise<void> {
    try {
      const metadata = this.extractMetadata(node);
      const recipientIds = new Set<string>();
      if (comment.notifyResponsible ?? true) {
        for (const id of metadata.raci.responsibleIds) recipientIds.add(id);
      }
      if (comment.notifyAccountable ?? true) {
        for (const id of metadata.raci.accountableIds) recipientIds.add(id);
      }
      if (comment.notifyConsulted ?? true) {
        for (const id of metadata.raci.consultedIds) recipientIds.add(id);
      }
      if (comment.notifyInformed ?? true) {
        for (const id of metadata.raci.informedIds) recipientIds.add(id);
      }

      if (comment.notifyProject ?? false) {
        const shareSummary = await this.buildNodeShareSummary(
          node,
          comment.author?.id ?? '',
        );
        for (const collab of shareSummary.collaborators) {
          if (collab.userId) recipientIds.add(collab.userId);
        }
      }

      if (comment.notifySubProject ?? false) {
        const descendants = await this.prisma.node.findMany({
          where: {
            teamId: node.teamId,
            path: { startsWith: node.path ? `${node.path}/` : `${node.id}/` },
          },
          select: {
            metadata: true,
            createdById: true,
          },
        });
        for (const descendant of descendants) {
          if (descendant.createdById) recipientIds.add(descendant.createdById);
          const raw =
            descendant.metadata &&
            typeof descendant.metadata === 'object' &&
            !Array.isArray(descendant.metadata)
              ? { ...(descendant.metadata as Record<string, any>) }
              : {};
          const share = normalizeShare(raw);
          for (const collab of share.collaborators) {
            if (collab.userId) recipientIds.add(collab.userId);
          }
        }
      }

      for (const mention of comment.mentions ?? []) {
        if (mention) recipientIds.add(mention);
      }

      const authorId = comment.author?.id ?? '';
      if (authorId) recipientIds.delete(authorId);
      recipientIds.delete('');

      if (!recipientIds.size) {
        await this.logCommentEmail({
          node,
          comment,
          recipients: [],
        });
        return;
      }

      const users = await this.prisma.user.findMany({
        where: { id: { in: Array.from(recipientIds) } },
        select: { id: true, email: true, displayName: true },
      });

      const dedupedRecipients: Array<{
        userId: string;
        email: string;
        displayName: string;
      }> = [];
      const emailSet = new Set<string>();
      for (const user of users) {
        const email = user.email?.trim();
        if (!email) continue;
        if (emailSet.has(email)) continue;
        emailSet.add(email);
        dedupedRecipients.push({
          userId: user.id,
          email,
          displayName: user.displayName ?? user.id,
        });
      }

      await this.logCommentEmail({
        node,
        comment,
        recipients: dedupedRecipients,
      });
    } catch (error) {
      // Le logging des mails ne doit jamais bloquer la création du commentaire
      console.error("Erreur lors de la simulation d'envoi de mail", error);
    }
  }

  private async appendMailLog(entry: MailLogEntry): Promise<void> {
    try {
      await this.deliverMail(entry);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        "Impossible d'envoyer le mail d'automatisation",
        err.stack ?? err.message,
      );
    }

    try {
      await this.writeMailLog(entry);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        "Impossible d'écrire dans le fichier de log des mails",
        err.stack ?? err.message,
      );
    }
  }

  private async logCommentEmail(params: {
    node: NodeModel;
    comment: {
      id: string;
      body: string;
      notifyResponsible: boolean;
      notifyAccountable: boolean;
      notifyConsulted: boolean;
      notifyInformed: boolean;
      notifyProject: boolean;
      notifySubProject: boolean;
      author: {
        id: string;
        displayName: string | null;
        email?: string | null;
      } | null;
    };
    recipients: Array<{ userId: string; email: string; displayName: string }>;
  }): Promise<void> {
    await this.appendMailLog({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: 'node-comment-notification',
      node: {
        id: params.node.id,
        title: params.node.title,
      },
      comment: {
        id: params.comment.id,
        body: params.comment.body,
        authorId: params.comment.author?.id ?? null,
        authorDisplayName: params.comment.author?.displayName ?? null,
      },
      notify: {
        responsible: params.comment.notifyResponsible ?? true,
        accountable: params.comment.notifyAccountable ?? true,
        consulted: params.comment.notifyConsulted ?? true,
        informed: params.comment.notifyInformed ?? true,
        project: params.comment.notifyProject ?? false,
        subProject: params.comment.notifySubProject ?? false,
      },
      recipients: params.recipients,
    });
  }

  private async writeMailLog(entry: MailLogEntry): Promise<void> {
    const logDir = join(process.cwd(), 'apps', 'backend', 'logs');
    const logPath = join(logDir, 'mail.log');
    await fs.mkdir(logDir, { recursive: true });
    await this.rotateMailLogIfNeeded(logPath);
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
  }

  private async rotateMailLogIfNeeded(logPath: string): Promise<void> {
    let stats: { size: number } | null = null;
    try {
      stats = await fs.stat(logPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return;
      }
      throw err;
    }

    if (!stats || stats.size < this.mailLogMaxBytes) {
      return;
    }

    const maxFiles = this.mailLogMaxFiles;
    for (let index = maxFiles; index >= 1; index--) {
      const source = index === 1 ? logPath : `${logPath}.${index - 1}`;
      const target = `${logPath}.${index}`;

      try {
        await fs.rm(target, { force: true });
      } catch {
        // ignore errors when removing previous archive
      }

      try {
        await fs.rename(source, target);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code === 'ENOENT') {
          continue;
        }
        throw err;
      }
    }
  }

  private resolveMailLogMaxBytes(): number {
    const raw = Number(process.env.MAIL_LOG_MAX_BYTES ?? DEFAULT_MAIL_LOG_MAX_BYTES);
    if (!Number.isFinite(raw) || raw <= 0) {
      return DEFAULT_MAIL_LOG_MAX_BYTES;
    }
    return raw;
  }

  private resolveMailLogMaxFiles(): number {
    const raw = Number(process.env.MAIL_LOG_MAX_FILES ?? DEFAULT_MAIL_LOG_MAX_FILES);
    if (!Number.isFinite(raw) || raw < 1) {
      return DEFAULT_MAIL_LOG_MAX_FILES;
    }
    return Math.max(Math.floor(raw), 1);
  }

  private async deliverMail(entry: MailLogEntry): Promise<void> {
    const recipients = Array.isArray(entry.recipients)
      ? entry.recipients.filter((recipient) => recipient?.email)
      : [];

    if (!recipients.length) {
      return;
    }

    const payload = this.buildMailPayload(entry);
    if (!payload) {
      return;
    }

    const metadata: Record<string, any> = {
      type: entry.type,
      nodeId: entry.node?.id ?? null,
      entryId: entry.id,
      timestamp: entry.timestamp,
    };

    if (payload.metadata) {
      Object.assign(metadata, payload.metadata);
    }

    try {
      await this.mailService.sendMail({
        to: recipients.map((recipient) => ({
          email: recipient.email,
          displayName: recipient.displayName,
        })),
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        metadata,
      });
    } catch (error) {
      throw error;
    }
  }

  private buildMailPayload(entry: MailLogEntry): MailPayload | null {
    const nodeTitle = entry.node?.title?.trim() || 'Sans titre';
    const baseMetadata = { nodeTitle, parentId: entry.node?.parentId ?? null };

    switch (entry.type) {
      case 'node-comment-notification': {
        const authorName =
          entry.comment?.authorDisplayName?.trim() ||
          entry.comment?.authorId ||
          'Un collaborateur';
        const commentBody = (entry.comment?.body ?? '').trim();
        const textBody = commentBody || '(commentaire vide)';
        const formattedDate = formatDateTime(entry.timestamp);
        const textLines = [
          `${authorName} a commenté "${nodeTitle}"`,
          formattedDate ? `le ${formattedDate}` : null,
          '',
          textBody,
          '',
          'Connectez-vous à Stratum pour répondre.',
        ].filter((line) => line !== null) as string[];

        const htmlBody = commentBody
          ? `<blockquote>${formatMultilineHtml(commentBody)}</blockquote>`
          : '<p><em>Commentaire vide</em></p>';

        return {
          subject: `[Stratum] Nouveau commentaire – ${nodeTitle}`,
          text: textLines.join('\n'),
          html: `<p><strong>${escapeHtml(authorName)}</strong> a commenté <em>${escapeHtml(
            nodeTitle,
          )}</em>.</p>${htmlBody}<p>Connectez-vous à Stratum pour répondre.</p>`,
          metadata: {
            ...baseMetadata,
            commentId: entry.comment?.id ?? null,
          },
        };
      }
      case 'backlog-review-reminder': {
        const nextReview = formatDateTime(entry.nextReviewAt ?? null);
        const frequency = entry.reviewEveryDays ?? null;
        const textLines = [
          `La tâche "${nodeTitle}" nécessite une revue backlog.`,
          nextReview
            ? `La dernière date planifiée était le ${nextReview}.`
            : "La dernière date planifiée n'a pas pu être déterminée.",
          frequency
            ? `Fréquence configurée : tous les ${frequency} jours.`
            : 'La fréquence configurée est indisponible.',
          '',
          'Merci de planifier une action ou de mettre à jour la tâche.',
        ];

        const htmlLines = [
          `<p>La tâche <em>${escapeHtml(nodeTitle)}</em> nécessite une revue backlog.</p>`,
          nextReview
            ? `<p>La dernière date planifiée était le <strong>${escapeHtml(nextReview)}</strong>.</p>`
            : `<p>La dernière date planifiée n'a pas pu être déterminée.</p>`,
          frequency
            ? `<p>Fréquence configurée : tous les <strong>${escapeHtml(String(
                frequency,
              ))}</strong> jours.</p>`
            : '<p>La fréquence configurée est indisponible.</p>',
          '<p>Merci de planifier une action ou de mettre à jour la tâche.</p>',
        ];

        return {
          subject: `[Stratum] Revue backlog à planifier – ${nodeTitle}`,
          text: textLines.join('\n'),
          html: htmlLines.join(''),
          metadata: {
            ...baseMetadata,
            nextReviewAt: entry.nextReviewAt ?? null,
            reviewEveryDays: frequency,
          },
        };
      }
      case 'backlog-auto-archive': {
        const archiveAfter = entry.archiveAfterDays ?? null;
        const textLines = [
          `La tâche "${nodeTitle}" a été archivée automatiquement depuis le backlog.`,
          archiveAfter
            ? `Délai configuré : ${archiveAfter} jours sans activité.`
            : 'Le délai configuré est indisponible.',
          '',
          'Vous pouvez restaurer la tâche depuis le panneau des archives si nécessaire.',
        ];

        const htmlLines = [
          `<p>La tâche <em>${escapeHtml(nodeTitle)}</em> a été archivée automatiquement depuis le backlog.</p>`,
          archiveAfter
            ? `<p>Délai configuré : <strong>${escapeHtml(String(archiveAfter))} jours</strong> sans activité.</p>`
            : '<p>Le délai configuré est indisponible.</p>',
          '<p>Vous pouvez restaurer la tâche depuis le panneau des archives si nécessaire.</p>',
        ];

        return {
          subject: `[Stratum] Tâche archivée depuis le backlog – ${nodeTitle}`,
          text: textLines.join('\n'),
          html: htmlLines.join(''),
          metadata: {
            ...baseMetadata,
            archiveAfterDays: archiveAfter,
          },
        };
      }
      case 'done-auto-archive': {
        const scheduledAt = formatDateTime(entry.archiveScheduledAt ?? null);
        const textLines = [
          `La tâche "${nodeTitle}" a quitté la colonne Terminé et a été archivée automatiquement.`,
          scheduledAt
            ? `Date de planification initiale : ${scheduledAt}.`
            : 'La date de planification initiale est indisponible.',
          '',
          'Vous pouvez restaurer la tâche depuis la colonne d’archives.',
        ];

        const htmlLines = [
          `<p>La tâche <em>${escapeHtml(nodeTitle)}</em> a quitté la colonne Terminé et a été archivée automatiquement.</p>`,
          scheduledAt
            ? `<p>Date de planification initiale : <strong>${escapeHtml(scheduledAt)}</strong>.</p>`
            : '<p>La date de planification initiale est indisponible.</p>',
          '<p>Vous pouvez restaurer la tâche depuis la colonne d’archives.</p>',
        ];

        return {
          subject: `[Stratum] Tâche archivée depuis Terminé – ${nodeTitle}`,
          text: textLines.join('\n'),
          html: htmlLines.join(''),
          metadata: {
            ...baseMetadata,
            archiveScheduledAt: entry.archiveScheduledAt ?? null,
          },
        };
      }
      case 'blocked-auto-reminder': {
        const reminderEvery = entry.reminderIntervalDays ?? null;
        const reason = (entry.blockedReason ?? '').trim();
        const textLines = [
          `La tâche "${nodeTitle}" est toujours bloquée.`,
          reminderEvery
            ? `Rappel automatique toutes les ${reminderEvery} journées.`
            : 'Aucun intervalle de relance n’a été trouvé.',
        ];

        if (reason) {
          textLines.push('', 'Contexte fourni :', reason);
        }

        textLines.push(
          '',
          'Merci de mettre à jour la fiche ou de contacter les responsables.',
        );

        const htmlParts = [
          `<p>La tâche <em>${escapeHtml(nodeTitle)}</em> est toujours bloquée.</p>`,
          reminderEvery
            ? `<p>Rappel automatique toutes les <strong>${escapeHtml(String(reminderEvery))}</strong> journées.</p>`
            : '<p>Aucun intervalle de relance n’a été trouvé.</p>',
        ];

        if (reason) {
          htmlParts.push(
            '<p>Contexte fourni :</p>',
            `<blockquote>${formatMultilineHtml(reason)}</blockquote>`,
          );
        }

        htmlParts.push(
          '<p>Merci de mettre à jour la fiche ou de contacter les responsables.</p>',
        );

        return {
          subject: `[Stratum] Relance automatique – ${nodeTitle}`,
          text: textLines.join('\n'),
          html: htmlParts.join(''),
          metadata: {
            ...baseMetadata,
            reminderIntervalDays: reminderEvery,
            blockedReason: reason || null,
          },
        };
      }
      default:
        return null;
    }
  }

  private buildSummary(node: any): NodeSummaryDto | undefined {
    // If board exists -> aggregate by column behavior
    if (node.board) {
      const counts = { backlog: 0, inProgress: 0, blocked: 0, done: 0 };
      for (const child of node.children) {
        const key = child.column?.behavior?.key;
        switch (key) {
          case 'BACKLOG':
            counts.backlog++;
            break;
          case 'IN_PROGRESS':
            counts.inProgress++;
            break;
          case 'BLOCKED':
            counts.blocked++;
            break;
          case 'DONE':
            counts.done++;
            break;
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
          select: {
            id: true,
            column: { select: { behavior: { select: { key: true } } } },
          },
        },
        board: {
          select: {
            id: true,
            columns: {
              select: { id: true, behavior: { select: { key: true } } },
            },
          },
        },
      },
    });
    if (!node) throw new NotFoundException();
    const summary = this.buildSummary(node);
    return {
      id: node.id,
      hasBoard: !!node.board,
      counts: summary?.counts || {
        backlog: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
      },
    };
  }

  async getDeletePreview(
    nodeId: string,
    userId: string,
  ): Promise<NodeDeletePreviewDto> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: { id: true, teamId: true, path: true },
    });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    const directChildren = await this.prisma.node.findMany({
      where: { parentId: node.id },
      select: {
        id: true,
        column: { select: { behavior: { select: { key: true } } } },
      },
    });

    const descendants = await this.prisma.node.findMany({
      where: {
        teamId: node.teamId,
        path: { startsWith: node.path + '/' },
      },
      select: {
        id: true,
        column: { select: { behavior: { select: { key: true } } } },
      },
    });

    const counts = {
      backlog: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
    };

    for (const child of descendants) {
      const key = child.column?.behavior?.key;
      switch (key) {
        case ColumnBehaviorKey.BACKLOG:
          counts.backlog++;
          break;
        case ColumnBehaviorKey.IN_PROGRESS:
          counts.inProgress++;
          break;
        case ColumnBehaviorKey.BLOCKED:
          counts.blocked++;
          break;
        case ColumnBehaviorKey.DONE:
          counts.done++;
          break;
        default:
          break;
      }
    }

    return {
      id: node.id,
      hasChildren: directChildren.length > 0,
      directChildren: directChildren.length,
      totalDescendants: descendants.length,
      counts,
    };
  }

  async listNodeCollaborators(
    nodeId: string,
    userId: string,
  ): Promise<NodeShareSummaryDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);
    return this.buildNodeShareSummary(node, userId);
  }

  async addNodeCollaborator(
    nodeId: string,
    dto: InviteNodeCollaboratorDto,
    userId: string,
  ): Promise<NodeShareSummaryDto> {
    const email = dto?.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email obligatoire');
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new BadRequestException('Email invalide');
    }

    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    const currentSummary = await this.buildNodeShareSummary(node, userId);
    if (
      currentSummary.collaborators.some((collab) => {
        if (!collab.email) return false;
        return collab.email.toLowerCase() === email;
      })
    ) {
      throw new ConflictException('Cet utilisateur a déjà accès à la tâche');
    }

    const metadata = this.extractMetadata(node);
    if (metadata.share.invitations.some((invite) => invite.email === email)) {
      throw new ConflictException(
        'Une invitation est déjà en attente pour cet email',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    const nowIso = new Date().toISOString();

    if (existingUser) {
      if (existingUser.id === userId) {
        throw new ConflictException(
          'Vous êtes déjà collaborateur de cette tâche',
        );
      }

      const alreadyDirect = metadata.share.collaborators.some(
        (collab) => collab.userId === existingUser.id,
      );
      if (alreadyDirect) {
        throw new ConflictException('Cet utilisateur a déjà accès à la tâche');
      }

      const membership = await this.prisma.membership.findFirst({
        where: {
          teamId: node.teamId,
          userId: existingUser.id,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (membership) {
        metadata.share.collaborators.push({
          userId: existingUser.id,
          addedById: userId,
          addedAt: nowIso,
        });
        writeShareBack(metadata);
        await this.prisma.node.update({
          where: { id: node.id },
          data: { metadata: metadata.raw as Prisma.InputJsonValue },
        });
        const nextNode = { ...node, metadata: metadata.raw } as NodeModel;
        return this.buildNodeShareSummary(nextNode, userId);
      }
    }

    metadata.share.invitations.push({
      email,
      invitedById: userId,
      invitedAt: nowIso,
      status: 'PENDING',
    });
    writeShareBack(metadata);

    await this.prisma.node.update({
      where: { id: node.id },
      data: { metadata: metadata.raw as Prisma.InputJsonValue },
    });

    const nextNode = { ...node, metadata: metadata.raw } as NodeModel;
    return this.buildNodeShareSummary(nextNode, userId);
  }

  async removeNodeCollaborator(
    nodeId: string,
    targetUserId: string,
    userId: string,
  ): Promise<NodeShareSummaryDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    const metadata = this.extractMetadata(node);
    const initialLength = metadata.share.collaborators.length;
    metadata.share.collaborators = metadata.share.collaborators.filter(
      (collab) => collab.userId !== targetUserId,
    );

    if (metadata.share.collaborators.length === initialLength) {
      throw new NotFoundException('Collaborateur non trouvé');
    }

    writeShareBack(metadata);
    await this.prisma.node.update({
      where: { id: node.id },
      data: { metadata: metadata.raw as Prisma.InputJsonValue },
    });

    const nextNode = { ...node, metadata: metadata.raw } as NodeModel;
    return this.buildNodeShareSummary(nextNode, userId);
  }

  async listNodeComments(
    nodeId: string,
    userId: string,
  ): Promise<NodeCommentDto[]> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: {
        comments: {
          include: {
            author: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);
    return this.mapCommentRecords(
      this.prisma,
      node.comments as unknown as Array<{
        id: string;
        nodeId: string;
        body: string;
        createdAt: Date;
        notifyResponsible: boolean;
        notifyAccountable: boolean;
        notifyConsulted: boolean;
        notifyInformed: boolean;
        notifyProject: boolean;
        notifySubProject: boolean;
        mentions: string[];
        author: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          email?: string | null;
        } | null;
      }>,
    );
  }

  async createNodeComment(
    nodeId: string,
    dto: CreateNodeCommentDto,
    userId: string,
  ): Promise<NodeCommentDto> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException();
    await this.ensureUserCanWrite(node.teamId, userId);

    const body = dto.body?.trim();
    if (!body) {
      throw new BadRequestException('Le commentaire est obligatoire');
    }
    if (body.length > 5000) {
      throw new BadRequestException(
        'Commentaire trop long (max 5000 caractères)',
      );
    }

    const mentions = Array.from(
      new Set(
        (dto.mentions ?? [])
          .map((mention) => mention?.trim())
          .filter((mention): mention is string => !!mention),
      ),
    );

    const comment = await this.prisma.comment.create({
      data: {
        nodeId,
        authorId: userId,
        body,
        mentions,
        notifyResponsible: dto.notifyResponsible ?? true,
        notifyAccountable: dto.notifyAccountable ?? true,
        notifyConsulted: dto.notifyConsulted ?? true,
        notifyInformed: dto.notifyInformed ?? true,
        notifyProject: dto.notifyProject ?? false,
        notifySubProject: dto.notifySubProject ?? false,
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });

    await this.dispatchCommentNotifications(
      node,
      comment as unknown as {
        id: string;
        body: string;
        notifyResponsible: boolean;
        notifyAccountable: boolean;
        notifyConsulted: boolean;
        notifyInformed: boolean;
        notifyProject: boolean;
        notifySubProject: boolean;
        mentions: string[];
        author: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          email?: string | null;
        } | null;
      },
    );

    const mapped = await this.mapCommentRecords(this.prisma, [
      comment as unknown as {
        id: string;
        nodeId: string;
        body: string;
        createdAt: Date;
        notifyResponsible: boolean;
        notifyAccountable: boolean;
        notifyConsulted: boolean;
        notifyInformed: boolean;
        notifyProject: boolean;
        notifySubProject: boolean;
        mentions: string[];
        author: {
          id: string;
          displayName: string | null;
          avatarUrl: string | null;
          email?: string | null;
        } | null;
      },
    ]);
    return mapped[0];
  }

  async listChildBoards(nodeId: string): Promise<NodeChildBoardDto[]> {
    // Nouveau: on ne se base plus sur le type mais sur la présence d'un board
    const boards = await this.prisma.board.findMany({
      where: { node: { parentId: nodeId } },
      select: {
        id: true,
        node: { select: { id: true, title: true, position: true } },
      },
      orderBy: { node: { position: 'asc' } },
    });
    return boards.map((b) => ({
      nodeId: b.node.id,
      boardId: b.id,
      name: b.node.title,
    }));
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
    // Suppression de la validation des sous-tâches pour permettre la conversion
    // TODO: Réactiver si besoin avec une logique appropriée

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

      let settings: Prisma.JsonValue | undefined;
      if (def.key === ColumnBehaviorKey.BACKLOG) {
        settings = {
          backlog: { ...DEFAULT_BACKLOG_SETTINGS },
        } as Prisma.JsonObject;
      } else if (def.key === ColumnBehaviorKey.DONE) {
        settings = {
          done: { ...DEFAULT_DONE_SETTINGS },
        } as Prisma.JsonObject;
      }

      await tx.column.create({
        data: {
          boardId,
          name: def.name,
          position: def.position,
          wipLimit: def.wipLimit,
          behaviorId: behavior.id,
          settings: settings ?? Prisma.JsonNull,
        },
      });
    }
  }

  private normalizeColumnSettings(
    value: Prisma.JsonValue | null,
  ): Record<string, any> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return { ...(value as Record<string, any>) };
  }

  private normalizeBacklogSettings(
    settings: Record<string, any> | null,
  ): BacklogColumnSettings {
    const source =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings.backlog &&
            typeof settings.backlog === 'object' &&
            !Array.isArray(settings.backlog)
            ? settings.backlog
            : settings)
        : {};
    const ensure = (value: unknown, fallback: number, max: number) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      const rounded = Math.floor(num);
      if (rounded < 1) return fallback;
      if (rounded > max) return max;
      return rounded;
    };
    const reviewAfterDays = ensure(
      (source as any).reviewAfterDays,
      DEFAULT_BACKLOG_SETTINGS.reviewAfterDays,
      365,
    );
    const reviewEveryDays = ensure(
      (source as any).reviewEveryDays,
      DEFAULT_BACKLOG_SETTINGS.reviewEveryDays,
      365,
    );
    const archiveAfterDays = ensure(
      (source as any).archiveAfterDays,
      DEFAULT_BACKLOG_SETTINGS.archiveAfterDays,
      730,
    );
    return {
      reviewAfterDays,
      reviewEveryDays,
      archiveAfterDays,
    };
  }

  private normalizeDoneSettings(
    settings: Record<string, any> | null,
  ): DoneColumnSettings {
    const source =
      settings && typeof settings === 'object' && !Array.isArray(settings)
        ? (settings.done &&
            typeof settings.done === 'object' &&
            !Array.isArray(settings.done)
            ? settings.done
            : settings)
        : {};
    const ensure = (value: unknown, fallback: number) => {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      const rounded = Math.floor(num);
      if (rounded < 0) return 0;
      if (rounded > 730) return 730;
      return rounded;
    };
    const archiveAfterDays = ensure(
      (source as any).archiveAfterDays,
      DEFAULT_DONE_SETTINGS.archiveAfterDays,
    );
    return { archiveAfterDays };
  }

  private addDaysIso(base: Date, days: number): string {
    const next = new Date(base.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString();
  }

  private mapNode(node: NodeModel): NodeDto {
    const metadata = this.extractMetadata(node);
    return {
      id: node.id,
      shortId: Number(node.shortId ?? 0),
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
      blockedReason: (node as any).blockedReason ?? null,
      blockedReminderEmails: (node as any).blockedReminderEmails ?? [],
      blockedReminderIntervalDays:
        (node as any).blockedReminderIntervalDays ?? null,
      blockedReminderLastSentAt: (node as any).blockedReminderLastSentAt
        ? (node as any).blockedReminderLastSentAt.toISOString?.()
        : null,
      blockedExpectedUnblockAt: (node as any).blockedExpectedUnblockAt
        ? (node as any).blockedExpectedUnblockAt.toISOString?.()
        : null,
      blockedSince: (node as any).blockedSince
        ? (node as any).blockedSince.toISOString?.()
        : null,
      isBlockResolved: (node as any).isBlockResolved ?? false,
      backlogHiddenUntil: metadata.workflow.backlog.hiddenUntil,
      backlogNextReviewAt: metadata.workflow.backlog.nextReviewAt,
      backlogReviewStartedAt: metadata.workflow.backlog.reviewStartedAt,
      backlogLastInteractionAt: metadata.workflow.backlog.lastInteractionAt,
      backlogLastReminderAt: metadata.workflow.backlog.lastReminderAt,
      lastKnownColumnId: metadata.workflow.backlog.lastKnownColumnId,
      lastKnownColumnBehavior: metadata.workflow.backlog.lastKnownBehavior,
      doneArchiveScheduledAt: metadata.workflow.done.archiveScheduledAt,
      archivedAt: node.archivedAt ? node.archivedAt.toISOString() : null,
      priority: (node as any).priority ?? 'NONE',
      effort: (node as any).effort ?? null,
      tags: (node as any).tags ?? [],
      raci: metadata.raci,
      timeTracking: metadata.timeTracking,
      financials: metadata.financials,
    };
  }

  private async buildNodeShareSummary(
    node: NodeModel,
    requestingUserId: string,
  ): Promise<NodeShareSummaryDto> {
    const metadata = this.extractMetadata(node);

    const aggregated = new Map<
      string,
      {
        userId: string;
        accessType: 'OWNER' | 'DIRECT' | 'INHERITED' | 'SELF';
        viaNodes: { nodeId: string; title: string }[];
        addedAt: string | null;
        addedById: string | null;
      }
    >();

    const priority: Record<'OWNER' | 'DIRECT' | 'INHERITED' | 'SELF', number> =
      {
        OWNER: 4,
        DIRECT: 3,
        SELF: 2,
        INHERITED: 1,
      };

    const addCollaborator = (
      userId: string,
      accessType: 'OWNER' | 'DIRECT' | 'INHERITED' | 'SELF',
      opts: {
        viaNode?: { nodeId: string; title: string };
        addedAt?: string | null;
        addedById?: string | null;
      } = {},
    ) => {
      if (!userId) return;
      const existing = aggregated.get(userId);
      if (!existing) {
        aggregated.set(userId, {
          userId,
          accessType,
          viaNodes: opts.viaNode ? [opts.viaNode] : [],
          addedAt: opts.addedAt ?? null,
          addedById: opts.addedById ?? null,
        });
        return;
      }

      if (opts.viaNode) {
        const hasVia = existing.viaNodes.some(
          (via) => via.nodeId === opts.viaNode!.nodeId,
        );
        if (!hasVia) existing.viaNodes.push(opts.viaNode);
      }
      if (!existing.addedAt && opts.addedAt) existing.addedAt = opts.addedAt;
      if (!existing.addedById && opts.addedById)
        existing.addedById = opts.addedById;

      if (priority[accessType] > priority[existing.accessType]) {
        existing.accessType = accessType;
      }
    };

    if (node.createdById) {
      const createdAtIso =
        node.createdAt instanceof Date ? node.createdAt.toISOString() : null;
      addCollaborator(node.createdById, 'OWNER', { addedAt: createdAtIso });
    }

    for (const collab of metadata.share.collaborators) {
      addCollaborator(collab.userId, 'DIRECT', {
        addedAt: collab.addedAt,
        addedById: collab.addedById,
      });
    }

    const pathSegments = node.path.split('/').filter(Boolean);
    const ancestorIds = pathSegments.slice(
      0,
      Math.max(pathSegments.length - 1, 0),
    );
    if (ancestorIds.length > 0) {
      const ancestors = await this.prisma.node.findMany({
        where: { id: { in: ancestorIds } },
        select: { id: true, title: true, metadata: true },
      });
      const order = new Map(ancestorIds.map((id, index) => [id, index]));
      ancestors.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      for (const ancestor of ancestors) {
        const ancestorRaw =
          ancestor.metadata &&
          typeof ancestor.metadata === 'object' &&
          !Array.isArray(ancestor.metadata)
            ? { ...(ancestor.metadata as Record<string, any>) }
            : {};
        const share = normalizeShare(ancestorRaw);
        for (const collab of share.collaborators) {
          addCollaborator(collab.userId, 'INHERITED', {
            viaNode: { nodeId: ancestor.id, title: ancestor.title },
          });
        }
      }
    }

    if (!aggregated.has(requestingUserId)) {
      addCollaborator(requestingUserId, 'SELF');
    }

    const relatedUserIds = new Set<string>();
    for (const entry of aggregated.values()) {
      relatedUserIds.add(entry.userId);
      if (entry.addedById) relatedUserIds.add(entry.addedById);
    }

    const users = relatedUserIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: Array.from(relatedUserIds) } },
          select: { id: true, displayName: true, email: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user]));

    const ordered = Array.from(aggregated.values()).sort((a, b) => {
      const diff = priority[b.accessType] - priority[a.accessType];
      if (diff !== 0) return diff;
      const nameA = (
        userMap.get(a.userId)?.displayName ?? a.userId
      ).toLowerCase();
      const nameB = (
        userMap.get(b.userId)?.displayName ?? b.userId
      ).toLowerCase();
      return nameA.localeCompare(nameB, 'fr');
    });

    const collaborators: NodeShareCollaboratorDto[] = ordered.map((entry) => {
      const info = userMap.get(entry.userId);
      return {
        userId: entry.userId,
        displayName: info?.displayName ?? entry.userId,
        email: info?.email ?? '',
        avatarUrl: info?.avatarUrl ?? null,
        accessType: entry.accessType,
        viaNodes: entry.viaNodes,
        addedAt: entry.addedAt,
        addedById: entry.addedById,
      };
    });

    return {
      nodeId: node.id,
      collaborators,
      invitations: metadata.share.invitations.map((invite) => ({
        email: invite.email,
        invitedAt: invite.invitedAt,
        invitedById: invite.invitedById,
        status: invite.status,
      })),
    };
  }

  private extractMetadata(node: NodeModel): ExtractedMetadata {
    const rawRoot =
      node.metadata &&
      typeof node.metadata === 'object' &&
      !Array.isArray(node.metadata)
        ? { ...(node.metadata as Record<string, any>) }
        : {};

    const raciRaw =
      rawRoot.raci &&
      typeof rawRoot.raci === 'object' &&
      !Array.isArray(rawRoot.raci)
        ? { ...(rawRoot.raci as Record<string, any>) }
        : {};
    const timeRaw =
      rawRoot.timeTracking &&
      typeof rawRoot.timeTracking === 'object' &&
      !Array.isArray(rawRoot.timeTracking)
        ? { ...(rawRoot.timeTracking as Record<string, any>) }
        : {};
    const financialRaw =
      rawRoot.financials &&
      typeof rawRoot.financials === 'object' &&
      !Array.isArray(rawRoot.financials)
        ? { ...(rawRoot.financials as Record<string, any>) }
        : {};

    rawRoot.raci = raciRaw;
    rawRoot.timeTracking = timeRaw;
    rawRoot.financials = financialRaw;
    const workflowRaw =
      rawRoot.workflow &&
      typeof rawRoot.workflow === 'object' &&
      !Array.isArray(rawRoot.workflow)
        ? { ...(rawRoot.workflow as Record<string, any>) }
        : {};
    rawRoot.workflow = workflowRaw;
    const backlogWorkflowRaw =
      workflowRaw.backlog &&
      typeof workflowRaw.backlog === 'object' &&
      !Array.isArray(workflowRaw.backlog)
        ? { ...(workflowRaw.backlog as Record<string, any>) }
        : {};
    workflowRaw.backlog = backlogWorkflowRaw;
    const doneWorkflowRaw =
      workflowRaw.done &&
      typeof workflowRaw.done === 'object' &&
      !Array.isArray(workflowRaw.done)
        ? { ...(workflowRaw.done as Record<string, any>) }
        : {};
    workflowRaw.done = doneWorkflowRaw;
    const shareNormalized = normalizeShare(rawRoot);

    const responsibleIds = toStringArray(
      raciRaw.R ?? raciRaw.responsible ?? raciRaw.responsibleIds ?? [],
    );
    const accountableIds = toStringArray(
      raciRaw.A ?? raciRaw.accountable ?? raciRaw.accountableIds ?? [],
    );
    const consultedIds = toStringArray(
      raciRaw.C ?? raciRaw.consulted ?? raciRaw.consultedIds ?? [],
    );
    const informedIds = toStringArray(
      raciRaw.I ?? raciRaw.informed ?? raciRaw.informedIds ?? [],
    );

    const estimatedTimeHours = toNumberOrNull(
      timeRaw.estimatedTimeHours ?? timeRaw.estimatedHours ?? null,
    );
    const actualOpexHours = toNumberOrNull(
      timeRaw.actualOpexHours ?? timeRaw.opexHours ?? null,
    );
    const actualCapexHours = toNumberOrNull(
      timeRaw.actualCapexHours ?? timeRaw.capexHours ?? null,
    );
    const plannedStartDate = toDateStringOrNull(
      timeRaw.plannedStartDate ??
        timeRaw.startDate ??
        timeRaw.plannedStartAt ??
        null,
    );
    const plannedEndDate = toDateStringOrNull(
      timeRaw.plannedEndDate ?? timeRaw.endDate ?? timeRaw.plannedEndAt ?? null,
    );
    const actualEndDate = toDateStringOrNull(
      timeRaw.actualEndDate ??
        timeRaw.realEndDate ??
        timeRaw.actualEndAt ??
        null,
    );

    const billingRaw =
      typeof financialRaw.billingStatus === 'string'
        ? financialRaw.billingStatus.toUpperCase()
        : null;
    const billingStatus = BILLING_STATUS_VALUES.has(billingRaw ?? '')
      ? (billingRaw as 'TO_BILL' | 'BILLED' | 'PAID')
      : null;
    const hourlyRate = toNumberOrNull(
      financialRaw.hourlyRate ?? financialRaw.rate ?? null,
    );
    const plannedBudget = toNumberOrNull(
      financialRaw.plannedBudget ?? financialRaw.budgetPlanned ?? null,
    );
    const consumedBudgetValue = toNumberOrNull(
      financialRaw.consumedBudgetValue ??
        financialRaw.budgetConsumedValue ??
        null,
    );
    const consumedBudgetPercent = toNumberOrNull(
      financialRaw.consumedBudgetPercent ??
        financialRaw.budgetConsumedPercent ??
        null,
    );

    const totalHours = (actualOpexHours ?? 0) + (actualCapexHours ?? 0);
    const actualCost =
      hourlyRate !== null
        ? Math.round(totalHours * hourlyRate * 100) / 100
        : null;

    const backlogHiddenUntil = toIsoDateTimeOrNull(
      backlogWorkflowRaw.hiddenUntil,
    );
    if (backlogHiddenUntil === null)
      delete backlogWorkflowRaw.hiddenUntil;
    else backlogWorkflowRaw.hiddenUntil = backlogHiddenUntil;
    const backlogReviewStartedAt = toIsoDateTimeOrNull(
      backlogWorkflowRaw.reviewStartedAt,
    );
    if (backlogReviewStartedAt === null)
      delete backlogWorkflowRaw.reviewStartedAt;
    else backlogWorkflowRaw.reviewStartedAt = backlogReviewStartedAt;
    const backlogLastInteractionAt = toIsoDateTimeOrNull(
      backlogWorkflowRaw.lastInteractionAt,
    );
    if (backlogLastInteractionAt === null)
      delete backlogWorkflowRaw.lastInteractionAt;
    else backlogWorkflowRaw.lastInteractionAt = backlogLastInteractionAt;
    const backlogLastReminderAt = toIsoDateTimeOrNull(
      backlogWorkflowRaw.lastReminderAt,
    );
    if (backlogLastReminderAt === null)
      delete backlogWorkflowRaw.lastReminderAt;
    else backlogWorkflowRaw.lastReminderAt = backlogLastReminderAt;
    const backlogNextReviewAt = toIsoDateTimeOrNull(
      backlogWorkflowRaw.nextReviewAt,
    );
    if (backlogNextReviewAt === null)
      delete backlogWorkflowRaw.nextReviewAt;
    else backlogWorkflowRaw.nextReviewAt = backlogNextReviewAt;
    const backlogLastColumnId =
      typeof backlogWorkflowRaw.lastKnownColumnId === 'string'
        ? backlogWorkflowRaw.lastKnownColumnId
        : null;
    if (backlogLastColumnId === null)
      delete backlogWorkflowRaw.lastKnownColumnId;
    else backlogWorkflowRaw.lastKnownColumnId = backlogLastColumnId;
    const backlogLastBehaviorRaw =
      typeof backlogWorkflowRaw.lastKnownBehavior === 'string'
        ? backlogWorkflowRaw.lastKnownBehavior
        : null;
    const allowedBehaviors = new Set<ColumnBehaviorKey | 'CUSTOM'>([
      ColumnBehaviorKey.BACKLOG,
      ColumnBehaviorKey.BLOCKED,
      ColumnBehaviorKey.DONE,
      ColumnBehaviorKey.IN_PROGRESS,
      ColumnBehaviorKey.CUSTOM,
    ]);
    const backlogLastBehavior = backlogLastBehaviorRaw && allowedBehaviors.has(
      backlogLastBehaviorRaw as ColumnBehaviorKey | 'CUSTOM',
    )
      ? (backlogLastBehaviorRaw as ColumnBehaviorKey | 'CUSTOM')
      : null;
    if (backlogLastBehavior === null)
      delete backlogWorkflowRaw.lastKnownBehavior;
    else backlogWorkflowRaw.lastKnownBehavior = backlogLastBehavior;

    const doneCompletedAt = toIsoDateTimeOrNull(doneWorkflowRaw.completedAt);
    if (doneCompletedAt === null) delete doneWorkflowRaw.completedAt;
    else doneWorkflowRaw.completedAt = doneCompletedAt;
    const doneArchiveScheduledAt = toIsoDateTimeOrNull(
      doneWorkflowRaw.archiveScheduledAt,
    );
    if (doneArchiveScheduledAt === null)
      delete doneWorkflowRaw.archiveScheduledAt;
    else doneWorkflowRaw.archiveScheduledAt = doneArchiveScheduledAt;

    return {
      raw: rawRoot,
      raci: {
        responsibleIds,
        accountableIds,
        consultedIds,
        informedIds,
      },
      timeTracking: {
        estimatedTimeHours,
        actualOpexHours,
        actualCapexHours,
        plannedStartDate,
        plannedEndDate,
        actualEndDate,
      },
      financials: {
        billingStatus,
        hourlyRate,
        plannedBudget,
        consumedBudgetValue,
        consumedBudgetPercent,
        actualCost,
      },
      share: {
        collaborators: shareNormalized.collaborators,
        invitations: shareNormalized.invitations,
      },
      workflow: {
        backlog: {
          hiddenUntil: backlogHiddenUntil,
          reviewStartedAt: backlogReviewStartedAt,
          lastInteractionAt: backlogLastInteractionAt,
          lastReminderAt: backlogLastReminderAt,
          nextReviewAt: backlogNextReviewAt,
          lastKnownColumnId: backlogLastColumnId,
          lastKnownBehavior: backlogLastBehavior,
        },
        done: {
          completedAt: doneCompletedAt,
          archiveScheduledAt: doneArchiveScheduledAt,
        },
      },
      workflowRaw: {
        backlog: backlogWorkflowRaw,
        done: doneWorkflowRaw,
      },
    };
  }

  private async syncRaciAssignments(
    tx: Prisma.TransactionClient,
    nodeId: string,
    desired: Record<RaciRole, string[]>,
  ): Promise<void> {
    const roles: RaciRole[] = ['R', 'A', 'C', 'I'];
    const existing = await tx.nodeAssignment.findMany({
      where: { nodeId, role: { in: roles } },
      select: { id: true, role: true, userId: true },
    });

    const desiredSet = new Set<string>();
    for (const role of roles) {
      for (const userId of desired[role]) {
        desiredSet.add(`${role}|${userId}`);
      }
    }

    const toDelete: string[] = [];
    const existingMap = new Map<string, string>();
    for (const assignment of existing) {
      const role = (assignment.role ?? '').toUpperCase();
      if (role === 'R' || role === 'A' || role === 'C' || role === 'I') {
        const key = `${role}|${assignment.userId}`;
        existingMap.set(key, assignment.id);
        if (!desiredSet.has(key)) {
          toDelete.push(assignment.id);
        }
      }
    }

    if (toDelete.length > 0) {
      await tx.nodeAssignment.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const entry of desiredSet) {
      if (!existingMap.has(entry)) {
        const [role, userId] = entry.split('|') as [RaciRole, string];
        await tx.nodeAssignment.create({
          data: { nodeId, userId, role },
        });
      }
    }
  }

  private buildAssignmentRecipients(
    assignments: Array<{
      role: string | null;
      user: { id: string; email: string | null; displayName: string | null } | null;
    }> = [],
  ): Array<{ userId: string | null; email: string; displayName: string }> {
    const recipients: Array<{ userId: string | null; email: string; displayName: string }> = [];
    const seen = new Set<string>();
    for (const assignment of assignments) {
      if (!assignment.user?.email) continue;
      const role = (assignment.role ?? '').toUpperCase();
      if (role && role !== 'R' && role !== 'A') continue;
      const email = assignment.user.email.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      recipients.push({
        userId: assignment.user.id,
        email,
        displayName: assignment.user.displayName ?? assignment.user.id,
      });
    }
    return recipients;
  }

  private buildEmailRecipients(
    emails: string[],
  ): Array<{ userId: string | null; email: string; displayName: string }> {
    const recipients: Array<{ userId: string | null; email: string; displayName: string }> = [];
    const seen = new Set<string>();
    for (const raw of emails) {
      const email = String(raw).trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ userId: null, email, displayName: email });
    }
    return recipients;
  }

  async runWorkflowAutomation(now: Date = new Date()): Promise<void> {
    if (this.workflowAutomationRunning) {
      return;
    }
    this.workflowAutomationRunning = true;
    try {
      await this.processBacklogWorkflow(now);
      await this.processDoneAutoArchive(now);
      await this.processBlockedReminders(now);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        'Workflow automation failed',
        err.stack ?? err.message,
      );
    } finally {
      this.workflowAutomationRunning = false;
    }
  }

  private async processBacklogWorkflow(now: Date): Promise<void> {
    const nodes = await this.prisma.node.findMany({
      where: {
        archivedAt: null,
        column: { behavior: { key: ColumnBehaviorKey.BACKLOG } },
      },
      include: {
        column: {
          select: {
            id: true,
            settings: true,
          },
        },
        assignments: {
          select: {
            role: true,
            user: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!nodes.length) {
      return;
    }

    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    for (const node of nodes) {
      const metadata = this.extractMetadata(node as unknown as NodeModel);
      const backlogState = metadata.workflow.backlog;
      const columnSettings = this.normalizeColumnSettings(
        (node.column as any)?.settings ?? null,
      );
      const backlogSettings = this.normalizeBacklogSettings(columnSettings);
      const recipients = this.buildAssignmentRecipients(
        (node as any).assignments ?? [],
      );

      let archived = false;
      if (backlogSettings.archiveAfterDays > 0) {
        const interactionIso = backlogState.lastInteractionAt;
        if (interactionIso) {
          const interactionMs = Date.parse(interactionIso);
          if (!Number.isNaN(interactionMs)) {
            const archiveDeadline = (
              interactionMs + backlogSettings.archiveAfterDays * DAY_IN_MS
            );
            if (archiveDeadline <= nowMs) {
              backlogState.reviewStartedAt = null;
              metadata.workflowRaw.backlog.reviewStartedAt = null;
              backlogState.nextReviewAt = null;
              metadata.workflowRaw.backlog.nextReviewAt = null;
              backlogState.hiddenUntil = null;
              metadata.workflowRaw.backlog.hiddenUntil = null;
              backlogState.lastReminderAt = nowIso;
              metadata.workflowRaw.backlog.lastReminderAt = nowIso;
              backlogState.lastInteractionAt = nowIso;
              metadata.workflowRaw.backlog.lastInteractionAt = nowIso;

              await this.prisma.node.update({
                where: { id: node.id },
                data: {
                  archivedAt: now,
                  metadata: metadata.raw as Prisma.InputJsonValue,
                },
              });

              await this.appendMailLog({
                id: randomUUID(),
                timestamp: nowIso,
                type: 'backlog-auto-archive',
                node: {
                  id: node.id,
                  title: node.title,
                  parentId: node.parentId,
                },
                columnId: node.columnId,
                archiveAfterDays: backlogSettings.archiveAfterDays,
                recipients,
              });
              archived = true;
            }
          }
        }
      }

      if (archived) {
        continue;
      }

      if (backlogState.hiddenUntil) {
        const hiddenUntilMs = Date.parse(backlogState.hiddenUntil);
        if (!Number.isNaN(hiddenUntilMs) && hiddenUntilMs > nowMs) {
          continue;
        }
      }

      const nextReviewIso = backlogState.nextReviewAt;
      if (!nextReviewIso) continue;
      const nextReviewMs = Date.parse(nextReviewIso);
      if (Number.isNaN(nextReviewMs) || nextReviewMs > nowMs) continue;

      const nextReviewAt = this.addDaysIso(
        now,
        backlogSettings.reviewEveryDays,
      );
      backlogState.nextReviewAt = nextReviewAt;
      metadata.workflowRaw.backlog.nextReviewAt = nextReviewAt;
      backlogState.lastReminderAt = nowIso;
      metadata.workflowRaw.backlog.lastReminderAt = nowIso;

      await this.prisma.node.update({
        where: { id: node.id },
        data: { metadata: metadata.raw as Prisma.InputJsonValue },
      });

      await this.appendMailLog({
        id: randomUUID(),
        timestamp: nowIso,
        type: 'backlog-review-reminder',
        node: {
          id: node.id,
          title: node.title,
          parentId: node.parentId,
        },
        columnId: node.columnId,
        nextReviewAt: nextReviewIso,
        reviewEveryDays: backlogSettings.reviewEveryDays,
        recipients,
      });
    }
  }

  private async processDoneAutoArchive(now: Date): Promise<void> {
    const nodes = await this.prisma.node.findMany({
      where: {
        archivedAt: null,
        column: { behavior: { key: ColumnBehaviorKey.DONE } },
      },
      include: {
        assignments: {
          select: {
            role: true,
            user: { select: { id: true, email: true, displayName: true } },
          },
        },
      },
    });

    if (!nodes.length) {
      return;
    }

    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    for (const node of nodes) {
      const metadata = this.extractMetadata(node as unknown as NodeModel);
      const archiveIso = metadata.workflow.done.archiveScheduledAt;
      if (!archiveIso) continue;
      const archiveMs = Date.parse(archiveIso);
      if (Number.isNaN(archiveMs) || archiveMs > nowMs) continue;

      metadata.workflow.done.archiveScheduledAt = null;
      metadata.workflowRaw.done.archiveScheduledAt = null;

      await this.prisma.node.update({
        where: { id: node.id },
        data: {
          archivedAt: now,
          metadata: metadata.raw as Prisma.InputJsonValue,
        },
      });

      const recipients = this.buildAssignmentRecipients(
        (node as any).assignments ?? [],
      );

      await this.appendMailLog({
        id: randomUUID(),
        timestamp: nowIso,
        type: 'done-auto-archive',
        node: {
          id: node.id,
          title: node.title,
          parentId: node.parentId,
        },
        columnId: node.columnId,
        archiveScheduledAt: archiveIso,
        recipients,
      });
    }
  }

  private async processBlockedReminders(now: Date): Promise<void> {
    const nodes = (await this.prisma.node.findMany({
      where: {
        archivedAt: null,
        column: { behavior: { key: ColumnBehaviorKey.BLOCKED } },
        blockedReminderIntervalDays: { not: null },
      },
      select: {
        id: true,
        parentId: true,
        title: true,
        blockedReminderEmails: true,
        blockedReminderIntervalDays: true,
        blockedSince: true,
        blockedReason: true,
        isBlockResolved: true,
      },
    })) as any;

    if (!nodes.length) {
      return;
    }

    const nowMs = now.getTime();
    const nowIso = now.toISOString();

    for (const node of nodes) {
      if (node.isBlockResolved) continue;
      const intervalDays = node.blockedReminderIntervalDays ?? null;
      if (!intervalDays || intervalDays <= 0) continue;
      const emails = Array.isArray(node.blockedReminderEmails)
        ? (node.blockedReminderEmails as string[])
        : [];
      if (!emails.length) continue;
      const recipients = this.buildEmailRecipients(emails);
      if (!recipients.length) continue;
      const baseline = (node as any).blockedReminderLastSentAt ?? node.blockedSince;
      if (!baseline) continue;
      const baselineMs = baseline.getTime();
      if (Number.isNaN(baselineMs)) continue;
      const dueMs = baselineMs + intervalDays * DAY_IN_MS;
      if (dueMs > nowMs) continue;

      await this.prisma.node.update({
        where: { id: node.id },
        data: { blockedReminderLastSentAt: now } as any,
      });

      await this.appendMailLog({
        id: randomUUID(),
        timestamp: nowIso,
        type: 'blocked-auto-reminder',
        node: { id: node.id, title: node.title, parentId: node.parentId },
        reminderIntervalDays: intervalDays,
        blockedReason: node.blockedReason ?? null,
        recipients,
      });
    }
  }

  private async ensureBoardWithColumns(
    tx: Prisma.TransactionClient,
    parent: { id: string; teamId: string },
  ): Promise<{
    board: { id: string };
    columns: Array<{
      id: string;
      behavior: { key: ColumnBehaviorKey };
      wipLimit: number | null;
      settings: Record<string, any> | null;
    }>;
  }> {
    let board = await tx.board.findUnique({
      where: { nodeId: parent.id },
      include: {
        columns: { include: { behavior: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!board) {
      const created = await tx.board.create({ data: { nodeId: parent.id } });
      const behaviors = await this.ensureDefaultColumnBehaviors(
        tx,
        parent.teamId,
      );
      await this.createDefaultColumns(tx, created.id, behaviors);
      board = await tx.board.findUnique({
        where: { nodeId: parent.id },
        include: {
          columns: {
            include: { behavior: true },
            orderBy: { position: 'asc' },
          },
        },
      });
    }
    if (!board) throw new BadRequestException('Echec creation board');
    return {
      board,
      columns: board.columns.map((c) => ({
        id: c.id,
        behavior: { key: c.behavior.key },
        wipLimit: c.wipLimit,
        settings: this.normalizeColumnSettings((c as any).settings ?? null),
      })),
    };
  }

  async ensureBoardOnly(
    nodeId: string,
    userId: string,
  ): Promise<{ boardId: string }> {
    const node = await this.prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new NotFoundException('Noeud introuvable');
    await this.ensureUserCanWrite(node.teamId, userId);
    const existing = await this.prisma.board.findUnique({
      where: { nodeId: node.id },
    });
    if (existing) return { boardId: existing.id };
    // Crée board + colonnes défaut dans une transaction réutilisant helpers
    const createdId = await this.prisma.$transaction(async (tx) => {
      let board = await tx.board.findUnique({ where: { nodeId: node.id } });
      if (!board) {
        board = await tx.board.create({ data: { nodeId: node.id } });
        const behaviors = await this.ensureDefaultColumnBehaviors(
          tx,
          node.teamId,
        );
        await this.createDefaultColumns(tx, board.id, behaviors);
      }
      return board.id;
    });
    return { boardId: createdId };
  }
}
