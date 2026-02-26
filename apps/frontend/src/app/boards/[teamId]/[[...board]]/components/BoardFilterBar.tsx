'use client';

/**
 * BoardFilterBar — Barre de contexte unifiée, rendue dans TOUTES les vues.
 *
 * Contient :
 *   - Champ de recherche avec support @mention, !priorité, #id
 *   - Chips pour les filtres actifs (supprimables individuellement)
 *   - Bouton "Filtres" qui ouvre le BoardFilterDrawer
 *   - Compteur de tâches affichées
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useBoardFilters } from '../context/BoardFilterContext';
import { BoardFilterDrawer } from './BoardFilterDrawer';
import {
  normalizeText,
  detectMentionContext,
  completeMention,
} from '../utils/search-tokens';
import type { PriorityValue, EffortValue, EffortFilterValue } from '../types/board-filters';
import { NO_EFFORT_TOKEN, UNASSIGNED_TOKEN } from '../types/board-filters';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

export interface BoardFilterBarProps {
  /** Nombre de tâches effectivement affichées après filtrage (optionnel) */
  tasksCount?: number;
  /** Options d'assignés pour le drawer (inclut UNASSIGNED_TOKEN en premier) */
  assigneeOptions: Array<{
    id: string;
    label: string;
    searchText?: string;
    description?: string;
  }>;
  /** Liste brute des assignés pour l'autocomplete @mention */
  allAssignees: Array<{ id: string; displayName: string }>;
  /** Options de priorité avec labels traduits */
  priorityOptions: Array<{ value: PriorityValue; label: string }>;
  /** Options d'effort avec labels */
  effortOptions: Array<{ value: EffortValue; label: string }>;
  /** Contrôles rapides spécifiques à la vue, affichés à droite de la recherche */
  rightSlot?: React.ReactNode;
  /** Sections supplémentaires dans le drawer (spécifiques à la vue) */
  extraDrawerSections?: React.ReactNode;
  className?: string;
}

// --------------------------------------------------------------------------
// Composant
// --------------------------------------------------------------------------

export function BoardFilterBar({
  tasksCount,
  assigneeOptions,
  allAssignees,
  priorityOptions,
  effortOptions,
  rightSlot,
  extraDrawerSections,
  className,
}: BoardFilterBarProps) {
  const { t: tBoard } = useTranslation('board');
  const {
    filters,
    setSearchQuery,
    setAssigneeIds,
    togglePriority,
    toggleEffort,
    setHideDone,
    setOnlyMine,
    resetFilters,
    activeFilterCount,
    isFiltering,
  } = useBoardFilters();

  const [draft, setDraft] = useState(filters.searchQuery);
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);

  // Synchroniser le draft si le contexte change depuis l'extérieur
  // (ex: changement de boardId ou reset)
  const externalQueryRef = useRef(filters.searchQuery);
  useEffect(() => {
    if (filters.searchQuery !== externalQueryRef.current) {
      externalQueryRef.current = filters.searchQuery;
      setDraft(filters.searchQuery);
    }
  }, [filters.searchQuery]);

  // Debounce 300ms vers le contexte
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = draft.trim();
      const current = filters.searchQuery;
      if (trimmed !== current) {
        externalQueryRef.current = trimmed;
        setSearchQuery(trimmed);
      }
    }, 300);
    return () => window.clearTimeout(handle);
  }, [draft, filters.searchQuery, setSearchQuery]);

  // Nettoyer timeout blur en unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) window.clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  // --------------------------------------------------------------------------
  // Autocomplete @mention
  // --------------------------------------------------------------------------

  const mentionCtx = useMemo(() => {
    if (!focused) return null;
    return detectMentionContext(draft);
  }, [draft, focused]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionCtx) return [] as typeof allAssignees;
    const q = normalizeText(mentionCtx.query);
    if (!q) return allAssignees;
    return allAssignees.filter((a) => normalizeText(a.displayName).includes(q));
  }, [mentionCtx, allAssignees]);

  const handleMentionSelect = useCallback(
    (displayName: string) => {
      if (!mentionCtx) return;
      setDraft(completeMention(draft, mentionCtx, displayName));
    },
    [draft, mentionCtx],
  );

  // --------------------------------------------------------------------------
  // Label helpers
  // --------------------------------------------------------------------------

  const priorityLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of priorityOptions) m[p.value] = p.label;
    return m;
  }, [priorityOptions]);

  const effortLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of effortOptions) m[e.value] = e.label;
    return m;
  }, [effortOptions]);

  const assigneeLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of assigneeOptions) m[o.id] = o.label;
    return m;
  }, [assigneeOptions]);

  // --------------------------------------------------------------------------
  // Chips actives
  // --------------------------------------------------------------------------

  const removeAssignee = useCallback(
    (id: string) => setAssigneeIds(filters.assigneeIds.filter((a) => a !== id)),
    [filters.assigneeIds, setAssigneeIds],
  );

  const removePriority = useCallback(
    (value: PriorityValue) => togglePriority(value),
    [togglePriority],
  );

  const removeEffort = useCallback(
    (value: EffortFilterValue) => toggleEffort(value),
    [toggleEffort],
  );

  const hasChips =
    filters.assigneeIds.length > 0 ||
    filters.priorities.length > 0 ||
    filters.efforts.length > 0 ||
    filters.onlyMine ||
    filters.hideDone;

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={`w-full ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-card/60 px-4 py-2.5 backdrop-blur">
        {/* --- Champ recherche --- */}
        <div className="relative min-w-[220px] flex-1">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => {
              if (blurTimeoutRef.current !== null) window.clearTimeout(blurTimeoutRef.current);
              setFocused(true);
            }}
            onBlur={() => {
              blurTimeoutRef.current = window.setTimeout(() => setFocused(false), 120);
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); setSearchQuery(''); } }}
            placeholder={tBoard('sharedFilter.search.placeholder')}
            className="w-full rounded-xl border border-white/10 bg-surface py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition focus:border-accent"
            aria-label={tBoard('sharedFilter.search.aria')}
          />
          {/* Autocomplete @mention */}
          {mentionCtx && mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-xl border border-white/10 bg-surface/95 shadow-2xl backdrop-blur">
              <ul className="max-h-52 overflow-y-auto py-1.5 text-sm">
                {mentionSuggestions.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(a.displayName); }}
                      className="flex w-full items-center px-4 py-2 text-left text-sm text-muted transition hover:bg-white/5 hover:text-foreground"
                    >
                      {a.displayName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* --- Chips filtres actifs --- */}
        {hasChips && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.onlyMine && (
              <Chip label={tBoard('sharedFilter.chips.mine')} onRemove={() => setOnlyMine(false)} />
            )}
            {filters.hideDone && (
              <Chip label={tBoard('sharedFilter.chips.hideDone')} onRemove={() => setHideDone(false)} />
            )}
            {filters.assigneeIds.map((id) => (
              <Chip
                key={id}
                label={id === UNASSIGNED_TOKEN
                  ? tBoard('filters.assignees.optionUnassigned.label')
                  : (assigneeLabelMap[id] ?? id)}
                onRemove={() => removeAssignee(id)}
              />
            ))}
            {filters.priorities.map((p) => (
              <Chip
                key={p}
                label={priorityLabelMap[p] ?? p}
                onRemove={() => removePriority(p)}
                colorClass="text-amber-300"
              />
            ))}
            {filters.efforts.map((e) => (
              <Chip
                key={e}
                label={e === NO_EFFORT_TOKEN
                  ? tBoard('filters.effort.noEffort')
                  : (effortLabelMap[e as EffortValue] ?? e)}
                onRemove={() => removeEffort(e)}
                colorClass="text-sky-300"
              />
            ))}
          </div>
        )}

        {/* --- Spacer --- */}
        <div className="flex-1" />

        {/* --- Slot vue-spécifique (tri, toggles, etc.) --- */}
        {rightSlot && (
          <div className="flex items-center gap-1.5">
            {rightSlot}
          </div>
        )}

        {/* --- Compteur + Bouton Filtres + Reset --- */}
        <div className="flex items-center gap-2">
          {typeof tasksCount === 'number' && (
            <span className="text-[11px] text-muted tabular-nums">
              {tasksCount} {tBoard(tasksCount === 1 ? 'sharedFilter.bar.task' : 'sharedFilter.bar.tasks')}
            </span>
          )}

          {isFiltering && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
              title={tBoard('filters.actions.reset')}
            >
              {tBoard('filters.actions.reset')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`relative flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
              activeFilterCount > 0
                ? 'border-accent/60 bg-accent/10 text-foreground'
                : 'border-white/15 bg-surface/70 text-muted hover:border-accent hover:text-foreground'
            }`}
            aria-label={tBoard('sharedFilter.bar.openDrawer')}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M3.5 5A1.5 1.5 0 015 3.5h14A1.5 1.5 0 0120.5 5l-5.5 7v4.382a1.5 1.5 0 01-.83 1.342l-3 1.5A1.5 1.5 0 019 17.882V12L3.5 5z" />
            </svg>
            {tBoard('sharedFilter.bar.openDrawer')}
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-background">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* --- Drawer filtres --- */}
      <BoardFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        assigneeOptions={assigneeOptions}
        priorityOptions={priorityOptions}
        effortOptions={effortOptions}
        extraSections={extraDrawerSections}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Chip interne
// --------------------------------------------------------------------------

interface ChipProps {
  label: string;
  onRemove: () => void;
  colorClass?: string;
}

function Chip({ label, onRemove, colorClass }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-white/15 bg-surface/80 px-2.5 py-1 text-[11px] font-medium ${colorClass ?? 'text-foreground'}`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted transition hover:bg-white/15 hover:text-foreground"
        aria-label={`Supprimer le filtre ${label}`}
      >
        <svg viewBox="0 0 8 8" fill="currentColor" className="h-2 w-2" aria-hidden>
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
