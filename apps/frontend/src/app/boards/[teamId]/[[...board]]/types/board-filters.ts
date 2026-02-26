/**
 * board-filters.ts — Source unique de vérité pour tous les types et constantes
 * liés aux filtres partagés entre les vues (Kanban, Liste, Mindmap, Gantt).
 *
 * Chaque vue peut avoir SES PROPRES filtres supplémentaires, mais les champs
 * ci-dessous sont partagés et persistent au changement de vue.
 */

// --------------------------------------------------------------------------
// Types primitifs (anciennement redéclarés dans 3 fichiers distincts)
// --------------------------------------------------------------------------

export type PriorityValue = 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';
export type EffortValue = 'UNDER2MIN' | 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export const NO_EFFORT_TOKEN = '__NO_EFFORT__' as const;
export type EffortFilterValue = EffortValue | typeof NO_EFFORT_TOKEN;

/** Token spécial pour les cartes sans assigné */
export const UNASSIGNED_TOKEN = '__UNASSIGNED__' as const;

// --------------------------------------------------------------------------
// Filtres partagés — appliqués dans toutes les vues
// --------------------------------------------------------------------------

export interface SharedBoardFilters {
  /** Recherche textuelle (supporte tokens @mention, !priorité, #id) */
  searchQuery: string;
  /** IDs des assignés sélectionnés (inclut UNASSIGNED_TOKEN) */
  assigneeIds: string[];
  /** Priorités sélectionnées */
  priorities: PriorityValue[];
  /** Efforts sélectionnés (inclut NO_EFFORT_TOKEN) */
  efforts: EffortFilterValue[];
  /** Masquer les colonnes/nœuds avec comportement DONE */
  hideDone: boolean;
  /** Afficher uniquement les tâches de l'utilisateur courant */
  onlyMine: boolean;
}

export const DEFAULT_SHARED_FILTERS: SharedBoardFilters = {
  searchQuery: '',
  assigneeIds: [],
  priorities: [],
  efforts: [],
  hideDone: false,
  onlyMine: false,
};

// --------------------------------------------------------------------------
// Helpers de comptage
// --------------------------------------------------------------------------

/** Nombre de filtres actifs (hors recherche textuelle) */
export function countActiveFilters(filters: SharedBoardFilters): number {
  return (
    (filters.assigneeIds.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.efforts.length > 0 ? 1 : 0) +
    (filters.hideDone ? 1 : 0) +
    (filters.onlyMine ? 1 : 0)
  );
}

export function hasActiveFilters(filters: SharedBoardFilters): boolean {
  return filters.searchQuery.trim().length > 0 || countActiveFilters(filters) > 0;
}

// --------------------------------------------------------------------------
// Clés localStorage
// --------------------------------------------------------------------------

export const sharedFiltersStorageKey = (boardId: string) =>
  `stratum:board:${boardId}:shared-filters:v1`;
