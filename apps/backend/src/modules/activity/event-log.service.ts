import { Injectable, Logger } from '@nestjs/common';
import {
  EventActorType,
  EventSource,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface LogNodeEventInput {
  nodeId: string;
  eventType: string;
  actorId?: string | null;
  actorType?: EventActorType;
  source?: EventSource;
  entityType?: string;
  entityId?: string;
  correlationId?: string | null;
  payload?: Record<string, unknown>;
  summary?: string;
}

@Injectable()
export class EventLogService {
  private readonly logger = new Logger(EventLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logNodeEvent(
    input: LogNodeEventInput,
    client?: PrismaClientLike,
  ): Promise<string | null> {
    const db = client ?? this.prisma;
    const node = await db.node.findUnique({
      where: { id: input.nodeId },
      select: {
        id: true,
        shortId: true,
        title: true,
        parentId: true,
        teamId: true,
        workspaceId: true,
        column: {
          select: {
            id: true,
            name: true,
            boardId: true,
          },
        },
        board: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!node) {
      this.logger.warn(
        `Canonical event skipped for missing node ${input.nodeId} (${input.eventType})`,
      );
      return null;
    }

    const boardId = node.board?.id ?? node.column?.boardId ?? null;
    const summary =
      input.summary?.trim() || this.buildSummary(input.eventType, node, input.payload);

    const event = await db.eventLog.create({
      data: {
        workspaceId: node.workspaceId,
        boardId,
        nodeId: node.id,
        actorType:
          input.actorType ??
          (input.actorId ? EventActorType.USER : EventActorType.SYSTEM),
        actorId: input.actorId ?? null,
        source: input.source ?? EventSource.API,
        eventType: input.eventType,
        entityType: input.entityType ?? 'node',
        entityId: input.entityId ?? node.id,
        correlationId: input.correlationId ?? null,
        payload: {
          summary,
          node: {
            id: node.id,
            shortId: node.shortId,
            title: node.title,
            parentId: node.parentId,
            teamId: node.teamId,
            workspaceId: node.workspaceId,
            boardId,
            columnId: node.column?.id ?? null,
            columnName: node.column?.name ?? null,
          },
          change: input.payload ?? null,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return event.id;
  }

  private buildSummary(
    eventType: string,
    node: { title: string; shortId: number | null },
    payload?: Record<string, unknown>,
  ): string {
    const reference = node.shortId ? `#${node.shortId}` : node.title;
    const title = node.title?.trim() || reference;

    const oldValue = this.formatValue(payload?.oldValue);
    const newValue = this.formatValue(payload?.newValue);
    const fromColumn = this.formatValue(payload?.fromColumnName);
    const toColumn = this.formatValue(payload?.toColumnName);
    const commentBody = this.formatValue(payload?.bodyPreview ?? payload?.body);

    switch (eventType) {
      case 'NODE_CREATED':
        return `Carte creee: ${title}`;
      case 'NODE_DELETED':
        return `Carte supprimee: ${title}`;
      case 'NODE_MOVED':
      case 'KANBAN_MOVED':
        if (fromColumn || toColumn) {
          return `Carte deplacee: ${title} (${fromColumn || '?'} -> ${toColumn || '?'})`;
        }
        return `Carte deplacee: ${title}`;
      case 'COMMENT_ADDED':
        if (commentBody) {
          return `Commentaire ajoute sur ${title}: ${commentBody}`;
        }
        return `Commentaire ajoute sur ${title}`;
      default:
        if (oldValue !== null || newValue !== null) {
          return `${eventType} sur ${title}: ${oldValue ?? 'vide'} -> ${newValue ?? 'vide'}`;
        }
        return `${eventType} sur ${title}`;
    }
  }

  private formatValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    try {
      const serialized = JSON.stringify(value);
      if (!serialized) return null;
      return serialized.length > 160
        ? `${serialized.slice(0, 157)}...`
        : serialized;
    } catch {
      return null;
    }
  }
}