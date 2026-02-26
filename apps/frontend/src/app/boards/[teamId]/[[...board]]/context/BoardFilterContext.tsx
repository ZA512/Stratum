'use client';

/**
 * BoardFilterContext — Contexte partagé pour les filtres universels.
 *
 * Ce contexte stocke les 6 filtres qui ont du sens dans TOUTES les vues :
 * searchQuery, assigneeIds, priorities, efforts, hideDone, onlyMine.
 *
 * Il persiste son état dans localStorage par boardId, afin que les filtres
 * survivent aux rechargements de page.
 *
 * Chaque vue (Kanban, Liste, Mindmap, Gantt) consomme ce contexte et peut
 * AJOUTER ses propres filtres spécifiques au-dessus.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type SharedBoardFilters,
  type PriorityValue,
  type EffortFilterValue,
  DEFAULT_SHARED_FILTERS,
  sharedFiltersStorageKey,
  hasActiveFilters,
  countActiveFilters,
} from '../types/board-filters';

// --------------------------------------------------------------------------
// Contexte
// --------------------------------------------------------------------------

interface BoardFilterContextValue {
  /** État courant des filtres partagés */
  filters: SharedBoardFilters;

  // Setters individuels
  setSearchQuery: (value: string) => void;
  setAssigneeIds: (ids: string[]) => void;
  setPriorities: (values: PriorityValue[]) => void;
  setEfforts: (values: EffortFilterValue[]) => void;
  setHideDone: (value: boolean) => void;
  setOnlyMine: (value: boolean) => void;

  // Toggles pratiques
  togglePriority: (value: PriorityValue) => void;
  toggleEffort: (value: EffortFilterValue) => void;

  /** Remet tous les filtres partagés à leur valeur par défaut */
  resetFilters: () => void;

  /** Nombre de filtres actifs (hors recherche textuelle) */
  activeFilterCount: number;
  /** true si au moins un filtre (incluant la recherche) est actif */
  isFiltering: boolean;
}

const BoardFilterContext = createContext<BoardFilterContextValue | null>(null);

// --------------------------------------------------------------------------
// Hook consommateur
// --------------------------------------------------------------------------

export function useBoardFilters(): BoardFilterContextValue {
  const ctx = useContext(BoardFilterContext);
  if (!ctx) throw new Error('useBoardFilters must be used within BoardFilterContextProvider');
  return ctx;
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

interface BoardFilterContextProviderProps {
  /** ID du board actif — détermine la clé localStorage */
  boardId: string | null | undefined;
  children: React.ReactNode;
}

export function BoardFilterContextProvider({
  boardId,
  children,
}: BoardFilterContextProviderProps) {
  const [filters, setFilters] = useState<SharedBoardFilters>({ ...DEFAULT_SHARED_FILTERS });
  const [hydrated, setHydrated] = useState(false);
  const storageKey = boardId ? sharedFiltersStorageKey(boardId) : null;
  // Ref pour éviter la ré-écriture localStorage pendant l'hydratation
  const isHydratingRef = useRef(false);

  // Hydrater depuis localStorage lors du changement de boardId
  useEffect(() => {
    if (!storageKey) {
      setFilters({ ...DEFAULT_SHARED_FILTERS });
      setHydrated(true);
      return;
    }
    if (typeof window === 'undefined') return;

    isHydratingRef.current = true;
    // Reset d'abord pour éviter que l'état précédent soit visible
    setFilters({ ...DEFAULT_SHARED_FILTERS });

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SharedBoardFilters>;
        const merged: SharedBoardFilters = {
          ...DEFAULT_SHARED_FILTERS,
          ...parsed,
        };
        setFilters(merged);
      }
    } catch {
      // Silencieux : écriture corrompue → on repart des défauts
    }
    setHydrated(true);
    isHydratingRef.current = false;
  }, [storageKey]);

  // Persister dans localStorage après chaque changement
  useEffect(() => {
    if (!hydrated || !storageKey || isHydratingRef.current) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(filters));
    } catch {
      // Ignorer les erreurs de stockage (mode privé, quota dépassé…)
    }
  }, [filters, hydrated, storageKey]);

  // --------------------------------------------------------------------------
  // Setters mémoïsés
  // --------------------------------------------------------------------------

  const setSearchQuery = useCallback((value: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: value }));
  }, []);

  const setAssigneeIds = useCallback((ids: string[]) => {
    setFilters((prev) => ({ ...prev, assigneeIds: ids }));
  }, []);

  const setPriorities = useCallback((values: PriorityValue[]) => {
    setFilters((prev) => ({ ...prev, priorities: values }));
  }, []);

  const setEfforts = useCallback((values: EffortFilterValue[]) => {
    setFilters((prev) => ({ ...prev, efforts: values }));
  }, []);

  const setHideDone = useCallback((value: boolean) => {
    setFilters((prev) => ({ ...prev, hideDone: value }));
  }, []);

  const setOnlyMine = useCallback((value: boolean) => {
    setFilters((prev) => ({ ...prev, onlyMine: value }));
  }, []);

  const togglePriority = useCallback((value: PriorityValue) => {
    setFilters((prev) => {
      const exists = prev.priorities.includes(value);
      return {
        ...prev,
        priorities: exists
          ? prev.priorities.filter((p) => p !== value)
          : [...prev.priorities, value],
      };
    });
  }, []);

  const toggleEffort = useCallback((value: EffortFilterValue) => {
    setFilters((prev) => {
      const exists = prev.efforts.includes(value);
      return {
        ...prev,
        efforts: exists
          ? prev.efforts.filter((e) => e !== value)
          : [...prev.efforts, value],
      };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ ...DEFAULT_SHARED_FILTERS });
  }, []);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const isFiltering = useMemo(() => hasActiveFilters(filters), [filters]);

  const value = useMemo<BoardFilterContextValue>(
    () => ({
      filters,
      setSearchQuery,
      setAssigneeIds,
      setPriorities,
      setEfforts,
      setHideDone,
      setOnlyMine,
      togglePriority,
      toggleEffort,
      resetFilters,
      activeFilterCount,
      isFiltering,
    }),
    [
      filters,
      setSearchQuery,
      setAssigneeIds,
      setPriorities,
      setEfforts,
      setHideDone,
      setOnlyMine,
      togglePriority,
      toggleEffort,
      resetFilters,
      activeFilterCount,
      isFiltering,
    ],
  );

  return (
    <BoardFilterContext.Provider value={value}>
      {children}
    </BoardFilterContext.Provider>
  );
}
