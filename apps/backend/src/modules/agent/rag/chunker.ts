import { createHash } from 'node:crypto';
import { DocumentChunk } from './rag.types';

const DEFAULT_MAX_TOKENS = 512;
const APPROX_CHARS_PER_TOKEN = 4;

/**
 * AN-P1-02 — Decoupe un body texte en chunks de taille bornee.
 *
 * Strategie: decoupe par paragraphes puis par phrases si necessaire.
 * Estimation tokens: ~4 caracteres par token (approximation).
 */
export function chunkText(
  text: string,
  maxTokens = DEFAULT_MAX_TOKENS,
): DocumentChunk[] {
  const maxChars = maxTokens * APPROX_CHARS_PER_TOKEN;
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  const chunks: DocumentChunk[] = [];
  let currentBuffer = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      // Flush current buffer
      if (currentBuffer.trim()) {
        chunks.push(buildChunk(chunks.length, currentBuffer.trim()));
        currentBuffer = '';
      }
      // Split long paragraph by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((currentBuffer + ' ' + sentence).length > maxChars && currentBuffer.trim()) {
          chunks.push(buildChunk(chunks.length, currentBuffer.trim()));
          currentBuffer = sentence;
        } else {
          currentBuffer = currentBuffer ? currentBuffer + ' ' + sentence : sentence;
        }
      }
    } else if ((currentBuffer + '\n\n' + paragraph).length > maxChars && currentBuffer.trim()) {
      chunks.push(buildChunk(chunks.length, currentBuffer.trim()));
      currentBuffer = paragraph;
    } else {
      currentBuffer = currentBuffer ? currentBuffer + '\n\n' + paragraph : paragraph;
    }
  }

  if (currentBuffer.trim()) {
    chunks.push(buildChunk(chunks.length, currentBuffer.trim()));
  }

  // Garantir au moins 1 chunk
  if (chunks.length === 0) {
    chunks.push(buildChunk(0, text.trim() || '(vide)'));
  }

  return chunks;
}

function buildChunk(index: number, text: string): DocumentChunk {
  return {
    chunkIndex: index,
    text,
    tokenCount: Math.ceil(text.length / APPROX_CHARS_PER_TOKEN),
    checksum: createHash('sha256').update(text).digest('hex'),
    metadata: {},
  };
}
