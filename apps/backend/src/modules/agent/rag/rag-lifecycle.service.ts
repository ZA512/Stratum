import { Injectable, Logger } from '@nestjs/common';
import { RagDocumentStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Seuils par defaut pour le tiering */
const DEFAULT_HOT_MAX_AGE_DAYS = 30;
const DEFAULT_WARM_MAX_AGE_DAYS = 90;
const DEFAULT_MAX_ACTIVE_CHUNKS = 10_000;

export interface LifecycleConfig {
  hotMaxAgeDays?: number;
  warmMaxAgeDays?: number;
  maxActiveChunksPerWorkspace?: number;
}

export interface PruneResult {
  staledDocuments: number;
  deletedDocuments: number;
  deletedChunks: number;
  deletedEmbeddings: number;
}

/**
 * AN-P1-04 — Memory lifecycle: tiering hot/warm/cold + pruning.
 *
 * - HOT: documents ACTIVE < hotMaxAgeDays (priorite retrieval max)
 * - WARM: documents ACTIVE entre hotMaxAgeDays et warmMaxAgeDays
 * - COLD: documents STALE ou > warmMaxAgeDays -> marques DELETED
 *
 * Pruning:
 *   1) Marquer STALE les documents trop anciens
 *   2) Supprimer les embeddings des documents DELETED
 *   3) Hard-delete les chunks/docs DELETED > warmMaxAgeDays
 *   4) Respecter le cap de chunks actifs par workspace
 */
@Injectable()
export class RagLifecycleService {
  private readonly logger = new Logger('RagLifecycle');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute le pruning pour un workspace donne.
   */
  async prune(
    workspaceId: string,
    config?: LifecycleConfig,
  ): Promise<PruneResult> {
    const hotMaxAge = config?.hotMaxAgeDays ?? DEFAULT_HOT_MAX_AGE_DAYS;
    const warmMaxAge = config?.warmMaxAgeDays ?? DEFAULT_WARM_MAX_AGE_DAYS;
    const maxChunks =
      config?.maxActiveChunksPerWorkspace ?? DEFAULT_MAX_ACTIVE_CHUNKS;

    const now = new Date();
    const warmCutoff = new Date(now.getTime() - warmMaxAge * 86_400_000);

    let staledDocuments = 0;
    let deletedDocuments = 0;
    let deletedChunks = 0;
    let deletedEmbeddings = 0;

    // 1) Documents ACTIVE trop anciens -> STALE
    const staleResult = await this.prisma.ragDocument.updateMany({
      where: {
        workspaceId,
        status: RagDocumentStatus.ACTIVE,
        updatedAt: { lt: warmCutoff },
      },
      data: { status: RagDocumentStatus.STALE },
    });
    staledDocuments = staleResult.count;

    // 2) Documents STALE -> DELETED (nettoyage final)
    const deleteResult = await this.prisma.ragDocument.updateMany({
      where: {
        workspaceId,
        status: RagDocumentStatus.STALE,
        updatedAt: { lt: warmCutoff },
      },
      data: { status: RagDocumentStatus.DELETED },
    });
    deletedDocuments = deleteResult.count;

    // 3) Hard-delete les chunks et embeddings des documents DELETED
    const deletedDocs = await this.prisma.ragDocument.findMany({
      where: {
        workspaceId,
        status: RagDocumentStatus.DELETED,
      },
      select: { id: true },
    });

    if (deletedDocs.length > 0) {
      const docIds = deletedDocs.map((d) => d.id);

      // Supprimer les embeddings first (FK)
      const embDelete = await this.prisma.ragEmbeddingRecord.deleteMany({
        where: { chunk: { documentId: { in: docIds } } },
      });
      deletedEmbeddings = embDelete.count;

      // Supprimer les chunks
      const chunkDelete = await this.prisma.ragChunk.deleteMany({
        where: { documentId: { in: docIds } },
      });
      deletedChunks = chunkDelete.count;

      // Supprimer les documents
      await this.prisma.ragDocument.deleteMany({
        where: { id: { in: docIds } },
      });
    }

    // 4) Respecter le cap de chunks actifs
    const activeChunkCount = await this.prisma.ragChunk.count({
      where: {
        document: {
          workspaceId,
          status: RagDocumentStatus.ACTIVE,
        },
      },
    });

    if (activeChunkCount > maxChunks) {
      const excess = activeChunkCount - maxChunks;
      this.logger.warn(
        `Workspace ${workspaceId}: ${activeChunkCount} chunks actifs, cap=${maxChunks}, ${excess} en exces`,
      );

      // Marquer les plus anciens documents comme STALE pour reduire
      const oldestDocs = await this.prisma.ragDocument.findMany({
        where: {
          workspaceId,
          status: RagDocumentStatus.ACTIVE,
        },
        orderBy: { updatedAt: 'asc' },
        take: Math.ceil(excess / 2), // approximation par documents
        select: { id: true },
      });

      if (oldestDocs.length > 0) {
        await this.prisma.ragDocument.updateMany({
          where: { id: { in: oldestDocs.map((d) => d.id) } },
          data: { status: RagDocumentStatus.STALE },
        });
        staledDocuments += oldestDocs.length;
      }
    }

    this.logger.log(
      `Prune ${workspaceId}: staled=${staledDocuments}, deleted=${deletedDocuments}, chunks=${deletedChunks}, embeddings=${deletedEmbeddings}`,
    );

    return { staledDocuments, deletedDocuments, deletedChunks, deletedEmbeddings };
  }

  /** Retourne les stats de tiering pour un workspace */
  async getStats(workspaceId: string): Promise<{
    hot: number;
    warm: number;
    cold: number;
    totalChunks: number;
    totalEmbeddings: number;
  }> {
    const now = new Date();
    const hotCutoff = new Date(
      now.getTime() - DEFAULT_HOT_MAX_AGE_DAYS * 86_400_000,
    );
    const warmCutoff = new Date(
      now.getTime() - DEFAULT_WARM_MAX_AGE_DAYS * 86_400_000,
    );

    const [hot, warm, cold, totalChunks, totalEmbeddings] = await Promise.all([
      this.prisma.ragDocument.count({
        where: {
          workspaceId,
          status: RagDocumentStatus.ACTIVE,
          updatedAt: { gte: hotCutoff },
        },
      }),
      this.prisma.ragDocument.count({
        where: {
          workspaceId,
          status: RagDocumentStatus.ACTIVE,
          updatedAt: { lt: hotCutoff, gte: warmCutoff },
        },
      }),
      this.prisma.ragDocument.count({
        where: {
          workspaceId,
          status: { in: [RagDocumentStatus.STALE, RagDocumentStatus.DELETED] },
        },
      }),
      this.prisma.ragChunk.count({
        where: { document: { workspaceId } },
      }),
      this.prisma.ragEmbeddingRecord.count({
        where: { chunk: { document: { workspaceId } } },
      }),
    ]);

    return { hot, warm, cold, totalChunks, totalEmbeddings };
  }
}
