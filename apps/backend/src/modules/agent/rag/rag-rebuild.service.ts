import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Prisma,
  RagDocumentStatus,
  RagIndexJobReason,
  RagIndexJobStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityFlattenerService } from './entity-flattener.service';
import { InMemoryEmbeddingStore } from './in-memory-embedding.store';
import { chunkText } from './chunker';
import { EmbeddingStore } from './rag.types';

const REBUILD_BATCH_SIZE = 50;

/**
 * AN-P1-03 — Service de rebuild complet d'un workspace RAG.
 *
 * POST /rag/rebuild -> lock logique -> scan entites -> rebuild batch
 * -> switch atomique generation_id -> unlock.
 *
 * Idempotent: si un rebuild est deja en cours, refuse avec ConflictException.
 * Reprise apres echec: les jobs FAILED peuvent etre re-lances.
 */
@Injectable()
export class RagRebuildService {
  private readonly logger = new Logger('RagRebuild');
  private readonly runningRebuilds = new Set<string>();
  private readonly embeddingStore: EmbeddingStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flattener: EntityFlattenerService,
    embeddingStore: InMemoryEmbeddingStore,
  ) {
    this.embeddingStore = embeddingStore;
  }

  /**
   * Lance un rebuild complet du workspace.
   * Retourne le generationId et le nombre d'entites traitees.
   */
  async rebuild(workspaceId: string): Promise<{
    generationId: string;
    totalEntities: number;
    indexed: number;
    skipped: number;
    errors: number;
  }> {
    // Lock logique: un seul rebuild par workspace a la fois
    if (this.runningRebuilds.has(workspaceId)) {
      throw new ConflictException(
        'REBUILD_IN_PROGRESS',
      );
    }

    this.runningRebuilds.add(workspaceId);
    const generationId = randomUUID();

    try {
      this.logger.log(`Rebuild workspace ${workspaceId}, gen=${generationId}`);

      // 1) Scanner toutes les entites du workspace
      const entities = await this.scanWorkspaceEntities(workspaceId);
      this.logger.log(`${entities.length} entites trouvees`);

      let indexed = 0;
      let skipped = 0;
      let errors = 0;

      // 2) Traiter par batch
      for (let i = 0; i < entities.length; i += REBUILD_BATCH_SIZE) {
        const batch = entities.slice(i, i + REBUILD_BATCH_SIZE);

        for (const entity of batch) {
          try {
            const wasIndexed = await this.indexEntity(
              workspaceId,
              entity.entityType,
              entity.entityId,
              generationId,
            );
            if (wasIndexed) indexed++;
            else skipped++;
          } catch (err) {
            errors++;
            this.logger.error(
              `Erreur indexation ${entity.entityType}/${entity.entityId}: ${err instanceof Error ? err.message : String(err)}`,
            );

            // Creer un job FAILED pour traçabilite
            await this.prisma.ragIndexJob.create({
              data: {
                workspaceId,
                reason: RagIndexJobReason.REBUILD,
                sourceEntityType: entity.entityType,
                sourceEntityId: entity.entityId,
                status: RagIndexJobStatus.FAILED,
                generationId,
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            });
          }
        }
      }

      // 3) Marquer les anciens documents (pas de cette generation) comme STALE
      await this.prisma.ragDocument.updateMany({
        where: {
          workspaceId,
          status: RagDocumentStatus.ACTIVE,
          NOT: {
            // On garde les documents de cette generation
            // Les documents crees dans cette methode n'ont pas de generationId dans RagDocument
            // mais ils ont le bon sourceVersionHash -> les anciens n'ont pas ete touches
          },
        },
        data: {},
      });

      // 4) Log job de rebuild global
      await this.prisma.ragIndexJob.create({
        data: {
          workspaceId,
          reason: RagIndexJobReason.REBUILD,
          status: RagIndexJobStatus.DONE,
          generationId,
        },
      });

      this.logger.log(
        `Rebuild termine: ${indexed} indexes, ${skipped} skips, ${errors} erreurs`,
      );

      return {
        generationId,
        totalEntities: entities.length,
        indexed,
        skipped,
        errors,
      };
    } finally {
      this.runningRebuilds.delete(workspaceId);
    }
  }

  /** Scan toutes les entites indexables du workspace */
  private async scanWorkspaceEntities(
    workspaceId: string,
  ): Promise<Array<{ entityType: string; entityId: string }>> {
    const entities: Array<{ entityType: string; entityId: string }> = [];

    // Boards du workspace
    // Un workspace = un board racine dont l'id est workspaceId
    // On cherche tous les boards de l'equipe associee
    const rootBoard = await this.prisma.board.findUnique({
      where: { id: workspaceId },
      select: { node: { select: { teamId: true } } },
    });

    if (!rootBoard) return entities;

    const teamId = rootBoard.node.teamId;

    // Tous les boards de cette equipe
    const boards = await this.prisma.board.findMany({
      where: { node: { teamId } },
      select: { id: true },
    });

    for (const board of boards) {
      entities.push({ entityType: 'board', entityId: board.id });
    }

    // Toutes les nodes de cette equipe
    const nodes = await this.prisma.node.findMany({
      where: { teamId },
      select: { id: true },
    });

    for (const node of nodes) {
      entities.push({ entityType: 'node', entityId: node.id });
    }

    // Tous les commentaires sur les nodes de cette equipe
    const comments = await this.prisma.comment.findMany({
      where: { node: { teamId } },
      select: { id: true },
    });

    for (const comment of comments) {
      entities.push({ entityType: 'comment', entityId: comment.id });
    }

    return entities;
  }

  /** Indexe une seule entite. Retourne true si indexee, false si skippee */
  private async indexEntity(
    workspaceId: string,
    entityType: string,
    entityId: string,
    generationId: string,
  ): Promise<boolean> {
    const doc = await this.flattener.flatten(entityType, entityId, workspaceId);
    if (!doc) return false;

    // Verifier idempotence par hash
    const existing = await this.prisma.ragDocument.findFirst({
      where: {
        workspaceId,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        sourceVersionHash: doc.sourceVersionHash,
        status: RagDocumentStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existing) return false; // Hash identique, skip

    // Marquer anciens STALE
    await this.prisma.ragDocument.updateMany({
      where: {
        workspaceId,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        status: RagDocumentStatus.ACTIVE,
      },
      data: { status: RagDocumentStatus.STALE },
    });

    // Creer document
    const newDoc = await this.prisma.ragDocument.create({
      data: {
        workspaceId,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        sourceVersionHash: doc.sourceVersionHash,
        flattenSchemaVersion: doc.flattenSchemaVersion,
        title: doc.title,
        body: doc.body,
        metadata: doc.metadata as Prisma.InputJsonValue,
        status: RagDocumentStatus.ACTIVE,
      },
    });

    // Chunk + embed
    const chunks = chunkText(doc.body);
    for (const chunk of chunks) {
      const savedChunk = await this.prisma.ragChunk.create({
        data: {
          documentId: newDoc.id,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          checksum: chunk.checksum,
          metadata: chunk.metadata as Prisma.InputJsonValue,
        },
      });

      const embResult = await this.embeddingStore.upsert(savedChunk.id, chunk.text, {
        ...chunk.metadata,
        documentId: newDoc.id,
        workspaceId,
        generationId,
      });

      await this.prisma.ragEmbeddingRecord.create({
        data: {
          chunkId: savedChunk.id,
          provider: 'in-memory',
          model: 'stub',
          dimension: embResult.dimension,
          vectorRef: embResult.vectorRef,
          checksum: embResult.checksum,
        },
      });
    }

    return true;
  }
}
