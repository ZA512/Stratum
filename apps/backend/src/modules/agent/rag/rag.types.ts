import { RagDocumentStatus, RagIndexJobStatus } from '@prisma/client';

/**
 * AN-P1-02 — Interfaces RAG
 */

/** Entité source canonique à indexer */
export interface RagSourceEntity {
  entityType: string;
  entityId: string;
  workspaceId: string;
}

/** Document aplati prêt à être découpé en chunks */
export interface FlattenedDocument {
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  sourceVersionHash: string;
  flattenSchemaVersion: string;
}

/** Chunk de texte prêt à être embeddé */
export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  tokenCount: number;
  checksum: string;
  metadata: Record<string, unknown>;
}

/** Résultat d'embedding pour un chunk */
export interface EmbeddingResult {
  vectorRef: string;
  checksum: string;
  dimension: number;
}

/** Interface d'abstraction pour le vector store */
export interface EmbeddingStore {
  upsert(
    chunkId: string,
    text: string,
    metadata: Record<string, unknown>,
  ): Promise<EmbeddingResult>;
  delete(vectorRef: string): Promise<void>;
  query(
    workspaceId: string,
    queryText: string,
    topK: number,
  ): Promise<Array<{ chunkId: string; score: number }>>;
  health(): Promise<{ ok: boolean; message?: string }>;
}

/** Interface pour l'aplatissement d'entités en documents RAG */
export interface EntityFlattener {
  supports(entityType: string): boolean;
  flatten(
    entityType: string,
    entityId: string,
    workspaceId: string,
  ): Promise<FlattenedDocument | null>;
}

/** Statuts exportés pour réutilisation */
export { RagDocumentStatus, RagIndexJobStatus };
