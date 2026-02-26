/**
 * search-tokens.ts — Parser unifié de la syntaxe de recherche avancée.
 *
 * Supporte les tokens :
 *   @nom        → filtre par assigné
 *   !priorité   → filtre par priorité (label ou valeur)
 *   #123        → filtre par shortId
 *   texte       → filtre textuel (≥ 2 caractères)
 *   "phrase"    → filtre textuel exact (groupé)
 *
 * Ce parser remplace les deux implémentations séparées qui existaient dans
 * BoardPageShell.tsx et BoardListView.tsx.
 */

import type { PriorityValue } from '../types/board-filters';

// --------------------------------------------------------------------------
// Normalisation
// --------------------------------------------------------------------------

export const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type ParsedSearchTokens = {
  /** Au moins un token a été trouvé */
  hasQuery: boolean;
  /** Termes textuels généraux (≥ 2 caractères) */
  textTerms: string[];
  /** Termes @mention normalisés */
  mentionTerms: string[];
  /** Valeurs de priorité parsées via ! */
  priorityValues: PriorityValue[];
  /** Chiffres issus des tokens #id */
  shortIdTerms: string[];
};

// --------------------------------------------------------------------------
// Constantes
// --------------------------------------------------------------------------

/** Regex de tokenisation : gère les guillemets et les préfixes @#! */
const TOKEN_REGEX = /[@#!]"[^"]*"|[@#!][^\s"]+|"[^"]+"|[^\s]+/g;

const PRIORITY_VALUES: PriorityValue[] = ['NONE', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'LOWEST'];

// --------------------------------------------------------------------------
// Parser
// --------------------------------------------------------------------------

/**
 * Parse une chaîne de recherche en tokens structurés.
 *
 * @param raw           La chaîne brute saisie par l'utilisateur.
 * @param priorityLabels Mapping valeur → label traduit pour résoudre les
 *                       tokens !priorité (ex: !critique → CRITICAL).
 */
export function parseSearchTokens(
  raw: string,
  priorityLabels: Record<PriorityValue, string>,
): ParsedSearchTokens {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      hasQuery: false,
      textTerms: [],
      mentionTerms: [],
      priorityValues: [],
      shortIdTerms: [],
    };
  }

  const tokens = trimmed.match(TOKEN_REGEX) ?? [];
  const textTerms: string[] = [];
  const mentionTerms: string[] = [];
  const priorityValuesSet = new Set<PriorityValue>();
  const shortIdTerms: string[] = [];

  for (const token of tokens) {
    if (!token) continue;

    let prefix: '@' | '!' | '#' | null = null;
    let content = token;

    if (content.startsWith('@') || content.startsWith('!') || content.startsWith('#')) {
      prefix = content[0] as '@' | '!' | '#';
      content = content.slice(1);
    }

    // Enlever les guillemets
    if (content.startsWith('"') && content.endsWith('"') && content.length >= 2) {
      content = content.slice(1, -1);
    }

    const normalized = normalizeText(content);

    if (prefix === '@') {
      if (normalized) mentionTerms.push(normalized);
      continue;
    }

    if (prefix === '!') {
      if (!normalized) continue;
      const matches = PRIORITY_VALUES.filter((value) => {
        const normalizedLabel = normalizeText(priorityLabels[value] ?? '');
        const normalizedValue = normalizeText(value);
        return normalizedLabel.includes(normalized) || normalizedValue.includes(normalized);
      });
      if (matches.length > 0) {
        matches.forEach((m) => priorityValuesSet.add(m));
        continue;
      }
      // Si aucune priorité ne match, le token devient du texte général
    }

    if (prefix === '#') {
      const digits = content.replace(/[^0-9]/g, '');
      if (digits) {
        shortIdTerms.push(digits);
        continue;
      }
      // Si pas de chiffres, token texte général
    }

    // Token texte général : minimum 2 caractères (moins restrictif que l'ancienne
    // limite de 3 dans BoardPageShell, plus cohérent avec l'usage réel)
    if (!normalized || normalized.length < 2) continue;
    textTerms.push(normalized);
  }

  return {
    hasQuery:
      textTerms.length > 0 ||
      mentionTerms.length > 0 ||
      priorityValuesSet.size > 0 ||
      shortIdTerms.length > 0,
    textTerms,
    mentionTerms,
    priorityValues: Array.from(priorityValuesSet),
    shortIdTerms,
  };
}

// --------------------------------------------------------------------------
// Helper de détection du contexte @mention en cours de frappe
// --------------------------------------------------------------------------

export type MentionContext = {
  /** Texte avant le token @mention en cours */
  base: string;
  /** Texte partiel de la mention (sans le @) */
  query: string;
};

/**
 * Retourne le contexte @mention actif si la fin du texte correspond à un
 * token @ en cours de frappe. Retourne null sinon.
 */
export function detectMentionContext(draft: string): MentionContext | null {
  const match = draft.match(/(?:^|\s)(@(?:"[^"]*|[^\s@]*))$/);
  if (!match) return null;
  const token = match[1];
  const base = draft.slice(0, draft.length - token.length);
  let query = token.slice(1);
  if (query.startsWith('"')) query = query.slice(1);
  query = query.replace(/"$/g, '');
  return { base, query };
}

/**
 * Construit la nouvelle valeur du champ de recherche après sélection d'une
 * suggestion @mention.
 */
export function completeMention(draft: string, ctx: MentionContext, displayName: string): string {
  const baseNeedsSpace = ctx.base.length > 0 && !/\s$/.test(ctx.base);
  const prefix = baseNeedsSpace ? `${ctx.base} ` : ctx.base;
  return `${prefix}@"${displayName}" `;
}
