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
export type SharedColumnBehavior = 'BACKLOG' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CUSTOM';
export type ProductivityPreset = 'TODAY' | 'OVERDUE' | 'THIS_WEEK' | 'NEXT_7_DAYS' | 'NO_DEADLINE';
export type ActivityPeriod = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';
export type ActivityTypeFilter = 'CREATION' | 'MODIFICATION' | 'COMMENT';

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
  /** Inclure le contenu des commentaires dans la recherche */
  searchIncludeComments: boolean;
  /** IDs des assignés sélectionnés (inclut UNASSIGNED_TOKEN) */
  assigneeIds: string[];
  /** Statuts sélectionnés */
  statusValues: SharedColumnBehavior[];
  /** Filtres de productivité rapides (OR entre les valeurs) */
  productivityPresets: ProductivityPreset[];
  /** Filtre d'activité */
  activity: {
    period: ActivityPeriod | null;
    types: ActivityTypeFilter[];
    from: string | null;
    to: string | null;
  };
  /** Priorités sélectionnées */
  priorities: PriorityValue[];
  /** Efforts sélectionnés (inclut NO_EFFORT_TOKEN) */
  efforts: EffortFilterValue[];
  /** Masquer les colonnes/nœuds avec comportement DONE */
  hideDone: boolean;
  /** Afficher uniquement les tâches de l'utilisateur courant */
  onlyMine: boolean;
}

export interface SharedBoardFilterPreset {
  id: string;
  name: string;
  filters: SharedBoardFilters;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_SHARED_FILTERS: SharedBoardFilters = {
  searchQuery: '',
  searchIncludeComments: false,
  assigneeIds: [],
  statusValues: [],
  productivityPresets: [],
  activity: {
    period: null,
    types: [],
    from: null,
    to: null,
  },
  priorities: [],
  efforts: [],
  hideDone: false,
  onlyMine: false,
};

export function normalizeSharedBoardFilters(input: Partial<SharedBoardFilters> | null | undefined): SharedBoardFilters {
  const activity = input?.activity ?? {};
  return {
    searchQuery: typeof input?.searchQuery === 'string' ? input.searchQuery : DEFAULT_SHARED_FILTERS.searchQuery,
    searchIncludeComments: Boolean(input?.searchIncludeComments),
    assigneeIds: Array.isArray(input?.assigneeIds) ? input.assigneeIds.filter((value): value is string => typeof value === 'string') : [],
    statusValues: Array.isArray(input?.statusValues)
      ? input.statusValues.filter(
          (value): value is SharedColumnBehavior =>
            value === 'BACKLOG' ||
            value === 'IN_PROGRESS' ||
            value === 'BLOCKED' ||
            value === 'DONE' ||
            value === 'CUSTOM',
        )
      : [],
    productivityPresets: Array.isArray((input as { productivityPresets?: unknown })?.productivityPresets)
      ? ((input as { productivityPresets?: unknown[] }).productivityPresets ?? []).filter(
          (value): value is ProductivityPreset =>
            value === 'TODAY' ||
            value === 'OVERDUE' ||
            value === 'THIS_WEEK' ||
            value === 'NEXT_7_DAYS' ||
            value === 'NO_DEADLINE',
        )
      : (input as { productivityPreset?: unknown })?.productivityPreset === 'TODAY' ||
          (input as { productivityPreset?: unknown })?.productivityPreset === 'OVERDUE' ||
          (input as { productivityPreset?: unknown })?.productivityPreset === 'THIS_WEEK' ||
          (input as { productivityPreset?: unknown })?.productivityPreset === 'NEXT_7_DAYS' ||
          (input as { productivityPreset?: unknown })?.productivityPreset === 'NO_DEADLINE'
        ? [(input as { productivityPreset: ProductivityPreset }).productivityPreset]
        : [],
    activity: {
      period:
        activity.period === 'TODAY' ||
        activity.period === 'LAST_7_DAYS' ||
        activity.period === 'LAST_30_DAYS' ||
        activity.period === 'CUSTOM'
          ? activity.period
          : null,
      types: Array.isArray(activity.types)
        ? activity.types.filter(
            (value): value is ActivityTypeFilter =>
              value === 'CREATION' || value === 'MODIFICATION' || value === 'COMMENT',
          )
        : [],
      from: typeof activity.from === 'string' ? activity.from : null,
      to: typeof activity.to === 'string' ? activity.to : null,
    },
    priorities: Array.isArray(input?.priorities)
      ? input.priorities.filter(
          (value): value is PriorityValue =>
            value === 'NONE' || value === 'CRITICAL' || value === 'HIGH' || value === 'MEDIUM' || value === 'LOW' || value === 'LOWEST',
        )
      : [],
    efforts: Array.isArray(input?.efforts)
      ? input.efforts.filter(
          (value): value is EffortFilterValue =>
            value === NO_EFFORT_TOKEN ||
            value === 'UNDER2MIN' ||
            value === 'XS' ||
            value === 'S' ||
            value === 'M' ||
            value === 'L' ||
            value === 'XL' ||
            value === 'XXL',
        )
      : [],
    hideDone: Boolean(input?.hideDone),
    onlyMine: Boolean(input?.onlyMine),
  };
}

// --------------------------------------------------------------------------
// Helpers de comptage
// --------------------------------------------------------------------------

/** Nombre de filtres actifs (hors recherche textuelle) */
export function countActiveFilters(filters: SharedBoardFilters): number {
  return (
    (filters.assigneeIds.length > 0 || filters.onlyMine ? 1 : 0) +
    (filters.statusValues.length > 0 ? 1 : 0) +
    (filters.productivityPresets.length > 0 ? 1 : 0) +
    (filters.activity.period || filters.activity.types.length > 0 ? 1 : 0) +
    (filters.priorities.length > 0 ? 1 : 0) +
    (filters.efforts.length > 0 ? 1 : 0) +
    (filters.hideDone ? 1 : 0) +
    0
  );
}

export function hasActiveFilters(filters: SharedBoardFilters): boolean {
  return filters.searchQuery.trim().length > 0 || countActiveFilters(filters) > 0;
}

// --------------------------------------------------------------------------
// Clés localStorage
// --------------------------------------------------------------------------

export const sharedFiltersStorageKey = (boardId: string) =>
  `stratum:board:${boardId}:shared-filters:v2`;

export const sharedFilterPresetsStorageKey = (boardId: string) =>
  `stratum:board:${boardId}:shared-filter-presets:v1`;
