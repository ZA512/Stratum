import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, RagDocumentStatus, RagIndexJobReason, RagIndexJobStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntityFlattenerService } from './entity-flattener.service';
import { InMemoryEmbeddingStore } from './in-memory-embedding.store';
import { chunkText } from './chunker';
import { EmbeddingStore } from './rag.types';

const POLL_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;
const BATCH_SIZE = 10;

/**
 * AN-P1-02 — Worker d'indexation incrementale.
 *
 * Pipeline: EventLog -> RagIndexJob -> flatten -> chunk -> embed -> store
 *
 * Idempotent: si le hash source n'a pas change, skip l'indexation.
 * Retry exponentiel sur echec, DLQ logique (status=FAILED, retryCount >= MAX).
 */
@Injectable()
export class RagIndexWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('RagIndexWorker');
  private polling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly embeddingStore: EmbeddingStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flattener: EntityFlattenerService,
    embeddingStore: InMemoryEmbeddingStore,
  ) {
    this.embeddingStore = embeddingStore;
  }

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  /* ── Polling ── */

  private startPolling(): void {
    if (this.pollTimer) return;
    this.logger.log(`Worker demarrage, poll chaque ${POLL_INTERVAL_MS}ms`);
    this.pollTimer = setInterval(() => {
      if (!this.polling) {
        this.polling = true;
        this.processBatch()
          .catch((err) => this.logger.error('Poll batch error', err))
          .finally(() => {
            this.polling = false;
          });
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /* ── Traitement batch ── */

  async processBatch(): Promise<number> {
    // Claim PENDING jobs (simple lock via update status)
    const pendingJobs = await this.prisma.ragIndexJob.findMany({
      where: { status: RagIndexJobStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
    });

    if (pendingJobs.length === 0) return 0;

    let processed = 0;
    for (const job of pendingJobs) {
      try {
        // Mark RUNNING
        await this.prisma.ragIndexJob.update({
          where: { id: job.id },
          data: { status: RagIndexJobStatus.RUNNING, updatedAt: new Date() },
        });

        await this.processJob(job);

        // Mark DONE
        await this.prisma.ragIndexJob.update({
          where: { id: job.id },
          data: { status: RagIndexJobStatus.DONE, updatedAt: new Date() },
        });
        processed++;
      } catch (err) {
        const retryCount = job.retryCount + 1;
        const newStatus =
          retryCount >= MAX_RETRIES
            ? RagIndexJobStatus.FAILED
            : RagIndexJobStatus.PENDING;

        const errorMessage =
          err instanceof Error ? err.message : String(err);

        await this.prisma.ragIndexJob.update({
          where: { id: job.id },
          data: {
            status: newStatus,
            retryCount,
            errorMessage,
            updatedAt: new Date(),
          },
        });

        if (newStatus === RagIndexJobStatus.FAILED) {
          this.logger.error(
            `Job ${job.id} DLQ apres ${MAX_RETRIES} retries: ${errorMessage}`,
          );
        } else {
          this.logger.warn(
            `Job ${job.id} echec retry ${retryCount}/${MAX_RETRIES}: ${errorMessage}`,
          );
        }
      }
    }

    return processed;
  }

  /* ── Traitement unitaire ── */

  private async processJob(job: {
    id: string;
    workspaceId: string;
    reason: RagIndexJobReason;
    sourceEntityType: string | null;
    sourceEntityId: string | null;
  }): Promise<void> {
    if (!job.sourceEntityType || !job.sourceEntityId) {
      this.logger.warn(`Job ${job.id} sans entite source, skip`);
      return;
    }

    if (!this.flattener.supports(job.sourceEntityType)) {
      this.logger.warn(
        `Job ${job.id} type non supporte: ${job.sourceEntityType}`,
      );
      return;
    }

    // 1) Flatten
    const doc = await this.flattener.flatten(
      job.sourceEntityType,
      job.sourceEntityId,
      job.workspaceId,
    );

    if (!doc) {
      // Entite supprimee -> marquer documents existants DELETED
      await this.markDocumentsDeleted(
        job.workspaceId,
        job.sourceEntityType,
        job.sourceEntityId,
      );
      return;
    }

    // 2) Verifier si le hash a change (idempotence)
    const existingDoc = await this.prisma.ragDocument.findFirst({
      where: {
        workspaceId: job.workspaceId,
        sourceEntityType: job.sourceEntityType,
        sourceEntityId: job.sourceEntityId,
        sourceVersionHash: doc.sourceVersionHash,
        status: RagDocumentStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (existingDoc) {
      // Hash identique, pas besoin de re-indexer
      return;
    }

    // 3) Marquer anciens documents STALE
    await this.prisma.ragDocument.updateMany({
      where: {
        workspaceId: job.workspaceId,
        sourceEntityType: job.sourceEntityType,
        sourceEntityId: job.sourceEntityId,
        status: RagDocumentStatus.ACTIVE,
      },
      data: { status: RagDocumentStatus.STALE },
    });

    // 4) Creer nouveau document
    const newDoc = await this.prisma.ragDocument.create({
      data: {
        workspaceId: job.workspaceId,
        sourceEntityType: job.sourceEntityType,
        sourceEntityId: job.sourceEntityId,
        sourceVersionHash: doc.sourceVersionHash,
        flattenSchemaVersion: doc.flattenSchemaVersion,
        title: doc.title,
        body: doc.body,
        metadata: doc.metadata as Prisma.InputJsonValue,
        status: RagDocumentStatus.ACTIVE,
      },
    });

    // 5) Chunk
    const chunks = chunkText(doc.body);

    // 6) Persist chunks + embed
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

      // 7) Embed
      const embResult = await this.embeddingStore.upsert(
        savedChunk.id,
        chunk.text,
        { ...chunk.metadata, documentId: newDoc.id, workspaceId: job.workspaceId },
      );

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

    this.logger.log(
      `Indexe ${job.sourceEntityType}/${job.sourceEntityId}: ${chunks.length} chunks`,
    );
  }

  /* ── Helpers ── */

  private async markDocumentsDeleted(
    workspaceId: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.prisma.ragDocument.updateMany({
      where: {
        workspaceId,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        status: { in: [RagDocumentStatus.ACTIVE, RagDocumentStatus.STALE] },
      },
      data: { status: RagDocumentStatus.DELETED },
    });
  }

  /* ── API publique (pour ProposalService / tests) ── */

  /** Creer un job d'indexation depuis un evenement */
  async enqueueFromEvent(
    workspaceId: string,
    entityType: string,
    entityId: string,
    eventId?: string,
  ): Promise<string> {
    const job = await this.prisma.ragIndexJob.create({
      data: {
        workspaceId,
        reason: RagIndexJobReason.EVENT,
        sourceEventId: eventId ?? null,
        sourceEntityType: entityType,
        sourceEntityId: entityId,
        status: RagIndexJobStatus.PENDING,
      },
    });
    return job.id;
  }
}
