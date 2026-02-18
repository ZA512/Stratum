import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  EntityFlattener,
  FlattenedDocument,
} from './rag.types';

const FLATTEN_SCHEMA_VERSION = '1.0';

/**
 * AN-P1-02 — Aplatissement des entités canoniques en documents RAG.
 *
 * Supporte: node, board, comment.
 * Extensible via ajout de méthodes flatten*.
 */
@Injectable()
export class EntityFlattenerService implements EntityFlattener {
  private readonly logger = new Logger('EntityFlattener');

  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: string): boolean {
    return ['node', 'board', 'comment'].includes(entityType);
  }

  async flatten(
    entityType: string,
    entityId: string,
    workspaceId: string,
  ): Promise<FlattenedDocument | null> {
    switch (entityType) {
      case 'node':
        return this.flattenNode(entityId, workspaceId);
      case 'board':
        return this.flattenBoard(entityId, workspaceId);
      case 'comment':
        return this.flattenComment(entityId, workspaceId);
      default:
        this.logger.warn(`Unsupported entity type: ${entityType}`);
        return null;
    }
  }

  private async flattenNode(
    nodeId: string,
    _workspaceId: string,
  ): Promise<FlattenedDocument | null> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        effort: true,
        dueDate: true,
        completedAt: true,
        parentId: true,
        columnId: true,
        teamId: true,
        updatedAt: true,
        column: { select: { name: true } },
        assignees: {
          select: {
            user: { select: { id: true, name: true } },
          },
        },
        tags: {
          select: { tag: { select: { name: true, color: true } } },
        },
      },
    });

    if (!node) return null;

    const parts: string[] = [];
    parts.push(`Tache: ${node.title}`);
    if (node.description) parts.push(`Description: ${node.description}`);
    if (node.priority) parts.push(`Priorite: ${node.priority}`);
    if (node.effort) parts.push(`Effort: ${node.effort}`);
    if (node.column?.name) parts.push(`Colonne: ${node.column.name}`);
    if (node.dueDate) parts.push(`Echeance: ${node.dueDate.toISOString()}`);
    if (node.completedAt) parts.push(`Terminee: ${node.completedAt.toISOString()}`);
    if (node.assignees.length > 0) {
      parts.push(`Assignes: ${node.assignees.map((a) => a.user.name).join(', ')}`);
    }
    if (node.tags.length > 0) {
      parts.push(`Tags: ${node.tags.map((t) => t.tag.name).join(', ')}`);
    }

    const body = parts.join('\n');
    const canonical = JSON.stringify({
      id: node.id,
      title: node.title,
      description: node.description,
      priority: node.priority,
      effort: node.effort,
      columnName: node.column?.name,
      dueDate: node.dueDate,
      completedAt: node.completedAt,
      updatedAt: node.updatedAt,
    });

    return {
      title: node.title,
      body,
      metadata: {
        entityType: 'node',
        entityId: node.id,
        parentId: node.parentId,
        columnId: node.columnId,
        teamId: node.teamId,
        priority: node.priority,
        effort: node.effort,
        tags: node.tags.map((t) => t.tag.name),
        assigneeIds: node.assignees.map((a) => a.user.id),
      },
      sourceVersionHash: this.computeHash(canonical),
      flattenSchemaVersion: FLATTEN_SCHEMA_VERSION,
    };
  }

  private async flattenBoard(
    boardId: string,
    _workspaceId: string,
  ): Promise<FlattenedDocument | null> {
    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        ownerUserId: true,
        updatedAt: true,
        node: { select: { title: true, teamId: true } },
        columns: {
          select: { id: true, name: true, position: true, behavior: true },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!board) return null;

    const title = board.node.title;
    const parts: string[] = [];
    parts.push(`Board: ${title}`);
    parts.push(`Colonnes: ${board.columns.map((c) => `${c.name} (${c.behavior})`).join(', ')}`);

    const body = parts.join('\n');
    const canonical = JSON.stringify({
      id: board.id,
      title,
      columns: board.columns.map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        behavior: c.behavior,
      })),
      updatedAt: board.updatedAt,
    });

    return {
      title,
      body,
      metadata: {
        entityType: 'board',
        entityId: board.id,
        teamId: board.node.teamId,
        ownerUserId: board.ownerUserId,
        columnCount: board.columns.length,
      },
      sourceVersionHash: this.computeHash(canonical),
      flattenSchemaVersion: FLATTEN_SCHEMA_VERSION,
    };
  }

  private async flattenComment(
    commentId: string,
    _workspaceId: string,
  ): Promise<FlattenedDocument | null> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        content: true,
        nodeId: true,
        userId: true,
        updatedAt: true,
        node: { select: { title: true } },
      },
    });

    if (!comment) return null;

    const body = `Commentaire sur "${comment.node.title}": ${comment.content}`;
    const canonical = JSON.stringify({
      id: comment.id,
      content: comment.content,
      nodeId: comment.nodeId,
      updatedAt: comment.updatedAt,
    });

    return {
      title: `Commentaire sur ${comment.node.title}`,
      body,
      metadata: {
        entityType: 'comment',
        entityId: comment.id,
        nodeId: comment.nodeId,
        userId: comment.userId,
      },
      sourceVersionHash: this.computeHash(canonical),
      flattenSchemaVersion: FLATTEN_SCHEMA_VERSION,
    };
  }

  private computeHash(canonical: string): string {
    return createHash('sha256').update(canonical).digest('hex');
  }
}
