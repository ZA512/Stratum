/**
 * AN-P0-08 — Confidence Gating
 *
 * Seuils de confiance pour les proposals:
 *   - HIGH   (>= 0.8): apply direct possible
 *   - MEDIUM (>= 0.5): apply avec warning, review recommandee
 *   - LOW    (< 0.5):  apply bloque, validation humaine obligatoire
 */

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ConfidenceGatingResult {
  level: ConfidenceLevel;
  score: number;
  /** true si l'apply est autorise */
  applyAllowed: boolean;
  /** Warning a afficher si applicable */
  warning?: string;
}

const HIGH_THRESHOLD = 0.8;
const MEDIUM_THRESHOLD = 0.5;

export function evaluateConfidence(score: number | null | undefined): ConfidenceGatingResult {
  const s = score ?? 0;

  if (s >= HIGH_THRESHOLD) {
    return {
      level: 'HIGH',
      score: s,
      applyAllowed: true,
    };
  }

  if (s >= MEDIUM_THRESHOLD) {
    return {
      level: 'MEDIUM',
      score: s,
      applyAllowed: true,
      warning:
        'Confiance moyenne. La review des actions est recommandee avant apply.',
    };
  }

  return {
    level: 'LOW',
    score: s,
    applyAllowed: false,
    warning:
      'Confiance basse. La validation humaine est obligatoire. Utilisez approve pour confirmer.',
  };
}
