import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { EmbeddingResult, EmbeddingStore } from './rag.types';

/**
 * AN-P1-02 — InMemoryEmbeddingStore (stub/dev).
 *
 * Stocke les vecteurs en mémoire. Utilisé en développement/tests.
 * En production, sera remplacé par PgVectorStoreAdapter ou QdrantStoreAdapter.
 */
@Injectable()
export class InMemoryEmbeddingStore implements EmbeddingStore {
  private readonly logger = new Logger('InMemoryEmbeddingStore');
  private readonly store = new Map<string, { chunkId: string; text: string; metadata: Record<string, unknown> }>();

  async upsert(
    chunkId: string,
    text: string,
    metadata: Record<string, unknown>,
  ): Promise<EmbeddingResult> {
    const vectorRef = `mem_${randomUUID()}`;
    this.store.set(vectorRef, { chunkId, text, metadata });

    return {
      vectorRef,
      checksum: createHash('sha256').update(text).digest('hex'),
      dimension: 0, // pas de vrai vecteur en mode in-memory
    };
  }

  async delete(vectorRef: string): Promise<void> {
    this.store.delete(vectorRef);
  }

  async query(
    _workspaceId: string,
    _queryText: string,
    topK: number,
  ): Promise<Array<{ chunkId: string; score: number }>> {
    // Stub: retourne les N premiers entries
    const entries = Array.from(this.store.values()).slice(0, topK);
    return entries.map((e) => ({ chunkId: e.chunkId, score: 0.5 }));
  }

  async health(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: `InMemory store: ${this.store.size} entries` };
  }
}
