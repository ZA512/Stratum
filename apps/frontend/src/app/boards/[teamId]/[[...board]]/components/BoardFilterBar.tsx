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
import type { PriorityValue, EffortValue, EffortFilterValue, SharedColumnBehavior } from '../types/board-filters';
import { NO_EFFORT_TOKEN, UNASSIGNED_TOKEN } from '../types/board-filters';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

export interface BoardFilterBarProps {
  /** Nombre de tâches effectivement affichées après filtrage (optionnel) */
  tasksCount?: number;
  /** Nombre total de tâches dans le scope courant */
  totalTasksCount?: number;
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
  showActiveChips?: boolean;
  showDefaultFamilies?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

// --------------------------------------------------------------------------
// Composant
// --------------------------------------------------------------------------

export function BoardFilterBar({
  tasksCount,
  totalTasksCount,
  assigneeOptions,
  allAssignees,
  priorityOptions,
  effortOptions,
  rightSlot,
  extraDrawerSections,
  showActiveChips = true,
  showDefaultFamilies = true,
  searchPlaceholder,
  className,
}: BoardFilterBarProps) {
  const { t: tBoard } = useTranslation('board');
  const [showAllChips, setShowAllChips] = useState(false);
  const {
    filters,
    setSearchQuery,
    setSearchIncludeComments,
    setFilters,
    setAssigneeIds,
    togglePriority,
    toggleEffort,
    setHideDone,
    setOnlyMine,
    resetFilters,
    isFiltering,
    savedPresets,
    applyPreset,
    createPreset,
    updatePreset,
    deletePreset,
  } = useBoardFilters();

  const [draft, setDraft] = useState(filters.searchQuery);
  const [focused, setFocused] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [familyMenu, setFamilyMenu] = useState<null | 'owner' | 'status' | 'productivity' | 'activity'>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const presetsRef = useRef<HTMLDivElement | null>(null);
  const familyMenuRef = useRef<HTMLDivElement | null>(null);

  const statusOptions: Array<{ value: SharedColumnBehavior; label: string }> = useMemo(
    () => [
      { value: 'BACKLOG', label: tBoard('behaviors.BACKLOG') },
      { value: 'IN_PROGRESS', label: tBoard('behaviors.IN_PROGRESS') },
      { value: 'BLOCKED', label: tBoard('behaviors.BLOCKED') },
      { value: 'DONE', label: tBoard('behaviors.DONE') },
    ],
    [tBoard],
  );

  const productivityOptions = useMemo(
    () => [
      { value: 'TODAY', label: tBoard('sharedFilter.productivity.options.TODAY') },
      { value: 'OVERDUE', label: tBoard('sharedFilter.productivity.options.OVERDUE') },
      { value: 'THIS_WEEK', label: tBoard('sharedFilter.productivity.options.THIS_WEEK') },
      { value: 'NEXT_7_DAYS', label: tBoard('sharedFilter.productivity.options.NEXT_7_DAYS') },
      { value: 'NO_DEADLINE', label: tBoard('sharedFilter.productivity.options.NO_DEADLINE') },
    ] as const,
    [tBoard],
  );

  const activityPeriodOptions = useMemo(
    () => [
      { value: 'TODAY', label: tBoard('sharedFilter.activity.periods.TODAY') },
      { value: 'LAST_7_DAYS', label: tBoard('sharedFilter.activity.periods.LAST_7_DAYS') },
      { value: 'LAST_30_DAYS', label: tBoard('sharedFilter.activity.periods.LAST_30_DAYS') },
    ] as const,
    [tBoard],
  );

  const activityTypeOptions = useMemo(
    () => [
      { value: 'CREATION', label: tBoard('sharedFilter.activity.types.CREATION') },
      { value: 'MODIFICATION', label: tBoard('sharedFilter.activity.types.MODIFICATION') },
      { value: 'COMMENT', label: tBoard('sharedFilter.activity.types.COMMENT') },
    ] as const,
    [tBoard],
  );

  const currentPreset = useMemo(() => {
    const serialized = JSON.stringify(filters);
    return savedPresets.find((entry) => JSON.stringify(entry.filters) === serialized) ?? null;
  }, [filters, savedPresets]);

  useEffect(() => {
    if (!presetsOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (presetsRef.current?.contains(event.target as Node)) return;
      setPresetsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [presetsOpen]);

  useEffect(() => {
    if (!familyMenu) return;
    const handleClick = (event: MouseEvent) => {
      if (familyMenuRef.current?.contains(event.target as Node)) return;
      setFamilyMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [familyMenu]);

  // Synchroniser le draft si le contexte change depuis l'extérieur
  // (ex: changement de boardId ou reset)
  const externalQueryRef = useRef(filters.searchQuery);
  useEffect(() => {
    if (filters.searchQuery !== externalQueryRef.current) {
      externalQueryRef.current = filters.searchQuery;
      setDraft(filters.searchQuery);
    }
  }, [filters.searchQuery]);

  // Debounce 180ms vers le contexte
  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = draft.trim();
      const current = filters.searchQuery;
      if (trimmed !== current) {
        externalQueryRef.current = trimmed;
        setSearchQuery(trimmed);
      }
    }, 180);
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
    filters.searchQuery.trim().length > 0 ||
    filters.searchIncludeComments ||
    filters.assigneeIds.length > 0 ||
    filters.statusValues.length > 0 ||
    filters.productivityPresets.length > 0 ||
    Boolean(filters.activity.period) ||
    filters.activity.types.length > 0 ||
    filters.priorities.length > 0 ||
    filters.efforts.length > 0 ||
    filters.onlyMine ||
    filters.hideDone;

  const chipItems = useMemo(() => {
    const items: Array<{
      key: string;
      label: string;
      onRemove: () => void;
      onClick?: () => void;
      colorClass?: string;
    }> = [];

    if (filters.searchQuery.trim().length > 0 || filters.searchIncludeComments) {
      items.push({
        key: 'search',
        label: filters.searchQuery.trim().length > 0
          ? `search: ${filters.searchQuery}${filters.searchIncludeComments ? ' + comments' : ''}`
          : 'search: comments',
        onRemove: () => {
          setDraft('');
          setSearchQuery('');
          setSearchIncludeComments(false);
        },
        onClick: () => inputRef.current?.focus(),
        colorClass: 'text-emerald-300',
      });
    }

    if (currentPreset) {
      items.push({
        key: `preset:${currentPreset.id}`,
        label: `preset: ${currentPreset.name}`,
        onRemove: () => resetFilters(),
        onClick: () => setPresetsOpen(true),
        colorClass: 'text-fuchsia-300',
      });
    }

    for (const preset of filters.productivityPresets) {
      items.push({
        key: `productivity:${preset}`,
        label: `productivity: ${productivityOptions.find((entry) => entry.value === preset)?.label ?? preset}`,
        onRemove: () => setFilters({
          ...filters,
          productivityPresets: filters.productivityPresets.filter((entry) => entry !== preset),
        }),
        onClick: () => setFamilyMenu('productivity'),
        colorClass: 'text-cyan-300',
      });
    }

    for (const statusValue of filters.statusValues) {
      items.push({
        key: `status:${statusValue}`,
        label: `status: ${statusOptions.find((entry) => entry.value === statusValue)?.label ?? statusValue}`,
        onRemove: () => setFilters({
          ...filters,
          statusValues: filters.statusValues.filter((value) => value !== statusValue),
        }),
        onClick: () => setFamilyMenu('status'),
        colorClass: 'text-orange-300',
      });
    }

    if (filters.activity.period) {
      items.push({
        key: `activity:period:${filters.activity.period}`,
        label: `activity: ${activityPeriodOptions.find((entry) => entry.value === filters.activity.period)?.label ?? filters.activity.period}`,
        onRemove: () => setFilters({ ...filters, activity: { ...filters.activity, period: null, from: null, to: null } }),
        onClick: () => setFamilyMenu('activity'),
        colorClass: 'text-rose-300',
      });
    }

    for (const activityType of filters.activity.types) {
      items.push({
        key: `activity:type:${activityType}`,
        label: `activity: ${activityTypeOptions.find((entry) => entry.value === activityType)?.label ?? activityType}`,
        onRemove: () => setFilters({
          ...filters,
          activity: {
            ...filters.activity,
            types: filters.activity.types.filter((value) => value !== activityType),
          },
        }),
        onClick: () => setFamilyMenu('activity'),
        colorClass: 'text-rose-300',
      });
    }

    if (filters.onlyMine) {
      items.push({
        key: 'mine',
        label: tBoard('sharedFilter.chips.mine'),
        onRemove: () => setOnlyMine(false),
      });
    }

    if (filters.hideDone) {
      items.push({
        key: 'hide-done',
        label: tBoard('sharedFilter.chips.hideDone'),
        onRemove: () => setHideDone(false),
      });
    }

    for (const id of filters.assigneeIds) {
      items.push({
        key: `assignee:${id}`,
        label: id === UNASSIGNED_TOKEN
          ? tBoard('filters.assignees.optionUnassigned.label')
          : (assigneeLabelMap[id] ?? id),
        onRemove: () => removeAssignee(id),
      });
    }

    for (const p of filters.priorities) {
      items.push({
        key: `priority:${p}`,
        label: priorityLabelMap[p] ?? p,
        onRemove: () => removePriority(p),
        colorClass: 'text-amber-300',
      });
    }

    for (const e of filters.efforts) {
      items.push({
        key: `effort:${e}`,
        label: e === NO_EFFORT_TOKEN
          ? tBoard('filters.effort.noEffort')
          : (effortLabelMap[e as EffortValue] ?? e),
        onRemove: () => removeEffort(e),
        colorClass: 'text-sky-300',
      });
    }

    return items;
  }, [
    filters,
    currentPreset,
    productivityOptions,
    statusOptions,
    activityPeriodOptions,
    setFilters,
    setOnlyMine,
    setHideDone,
    setSearchQuery,
    setSearchIncludeComments,
    resetFilters,
    tBoard,
    assigneeLabelMap,
    priorityLabelMap,
    effortLabelMap,
    removeAssignee,
    removePriority,
    removeEffort,
  ]);

  useEffect(() => {
    if (!hasChips) {
      setShowAllChips(false);
      return;
    }
    if (chipItems.length <= 6) {
      setShowAllChips(false);
    }
  }, [chipItems.length, hasChips]);

  const visibleChips = showAllChips ? chipItems : chipItems.slice(0, 6);
  const hiddenChipCount = showAllChips ? 0 : Math.max(0, chipItems.length - visibleChips.length);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className={`relative z-[60] w-full ${className ?? ''}`}>
      <div className="rounded-xl border border-white/10 bg-card/60 px-4 py-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {/* --- Champ recherche --- */}
          <div className="relative min-w-[220px] flex-1">
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <input
            ref={inputRef}
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
            placeholder={searchPlaceholder ?? tBoard('sharedFilter.search.placeholder')}
            className="w-full rounded-xl border border-white/10 bg-surface py-1.5 pl-8 pr-10 text-sm text-foreground outline-none transition focus:border-accent"
            aria-label={tBoard('sharedFilter.search.aria')}
          />
          <button
            type="button"
            onClick={() => setSearchIncludeComments(!filters.searchIncludeComments)}
            className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition ${filters.searchIncludeComments ? 'bg-accent/15 text-foreground' : 'hover:bg-white/5 hover:text-foreground'}`}
            title={tBoard('sharedFilter.search.includeComments')}
            aria-pressed={filters.searchIncludeComments}
            aria-label={tBoard('sharedFilter.search.includeComments')}
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden>comment</span>
          </button>
          {/* Autocomplete @mention */}
          {mentionCtx && mentionSuggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-[70] mt-1.5 rounded-xl border border-white/10 bg-surface/95 shadow-2xl backdrop-blur">
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
 
          {/* --- Spacer --- */}
          <div className="flex-1" />

          {/* --- Slot vue-spécifique (tri, toggles, etc.) --- */}
          {rightSlot && (
            <div className="flex items-center gap-1.5">
              {rightSlot}
            </div>
          )}

          {showDefaultFamilies && (
          <div ref={familyMenuRef} className="flex items-center gap-1.5">
            <div className="relative">
            <button
              type="button"
              onClick={() => setFamilyMenu((prev) => (prev === 'productivity' ? null : 'productivity'))}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${filters.productivityPresets.length > 0 ? 'border-accent/60 bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
            >
              {tBoard('sharedFilter.families.productivity')}
            </button>
            {familyMenu === 'productivity' && (
              <div className="absolute left-0 top-full z-[70] mt-2 w-52 rounded-xl border border-white/10 bg-surface/95 p-2 shadow-2xl backdrop-blur">
                {productivityOptions.map((option) => {
                  const active = filters.productivityPresets.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilters({
                        ...filters,
                        productivityPresets: active
                          ? filters.productivityPresets.filter((value) => value !== option.value)
                          : [...filters.productivityPresets, option.value],
                      })}
                      className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-xs transition ${active ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFamilyMenu((prev) => (prev === 'owner' ? null : 'owner'))}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${(filters.assigneeIds.length > 0 || filters.onlyMine) ? 'border-accent/60 bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
            >
              {tBoard('sharedFilter.families.owner')}
            </button>
            {familyMenu === 'owner' && (
              <div className="absolute left-0 top-full z-[70] mt-2 w-64 rounded-xl border border-white/10 bg-surface/95 p-2 shadow-2xl backdrop-blur">
                <button
                  type="button"
                  onClick={() => setOnlyMine(!filters.onlyMine)}
                  className={`mb-2 block w-full rounded-lg px-3 py-2 text-left text-xs transition ${filters.onlyMine ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                >
                  {tBoard('sharedFilter.drawer.onlyMine.label')}
                </button>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {assigneeOptions.map((option) => {
                    const active = filters.assigneeIds.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          if (active) setAssigneeIds(filters.assigneeIds.filter((value) => value !== option.id));
                          else setAssigneeIds([...filters.assigneeIds, option.id]);
                        }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition ${active ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFamilyMenu((prev) => (prev === 'status' ? null : 'status'))}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${filters.statusValues.length > 0 ? 'border-accent/60 bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
            >
              {tBoard('sharedFilter.families.status')}
            </button>
            {familyMenu === 'status' && (
              <div className="absolute left-0 top-full z-[70] mt-2 w-56 rounded-xl border border-white/10 bg-surface/95 p-2 shadow-2xl backdrop-blur">
                {statusOptions.map((option) => {
                  const active = filters.statusValues.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilters({
                        ...filters,
                        statusValues: active
                          ? filters.statusValues.filter((value) => value !== option.value)
                          : [...filters.statusValues, option.value],
                      })}
                      className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-xs transition ${active ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setFamilyMenu((prev) => (prev === 'activity' ? null : 'activity'))}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${(filters.activity.period || filters.activity.types.length > 0) ? 'border-accent/60 bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
            >
              {tBoard('sharedFilter.families.activity')}
            </button>
            {familyMenu === 'activity' && (
              <div className="absolute left-0 top-full z-[70] mt-2 w-64 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl backdrop-blur">
                <p className="mb-2 text-[11px] font-semibold text-foreground">{tBoard('sharedFilter.activity.sections.period')}</p>
                <div className="mb-3 space-y-1">
                  {activityPeriodOptions.map((option) => {
                    const active = filters.activity.period === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilters({
                          ...filters,
                          activity: {
                            ...filters.activity,
                            period: active ? null : option.value,
                          },
                        })}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition ${active ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mb-2 text-[11px] font-semibold text-foreground">{tBoard('sharedFilter.activity.sections.types')}</p>
                <div className="space-y-1">
                  {activityTypeOptions.map((option) => {
                    const active = filters.activity.types.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilters({
                          ...filters,
                          activity: {
                            ...filters.activity,
                            types: active
                              ? filters.activity.types.filter((value) => value !== option.value)
                              : [...filters.activity.types, option.value],
                          },
                        })}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-xs transition ${active ? 'bg-accent/15 text-foreground' : 'text-muted hover:bg-white/5 hover:text-foreground'}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setFilters({
                      ...filters,
                      activity: {
                        ...filters.activity,
                        period: 'LAST_7_DAYS',
                        types: ['CREATION', 'MODIFICATION', 'COMMENT'],
                      },
                    })}
                    className="mt-2 block w-full rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-muted transition hover:border-accent hover:text-foreground"
                  >
                    {tBoard('sharedFilter.activity.presets.anyLast7Days')}
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
          )}

          {/* --- Compteur + Bouton Affichage + Reset --- */}
          <div className="flex items-center gap-2">
            {showDefaultFamilies && (
            <div ref={presetsRef} className="relative">
            <button
              type="button"
              onClick={() => setPresetsOpen((prev) => !prev)}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
            >
              {tBoard('sharedFilter.presets.button')}
            </button>
            {presetsOpen && (
              <div className="absolute right-0 top-full z-[70] mt-2 w-72 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl backdrop-blur">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{tBoard('sharedFilter.presets.title')}</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const name = window.prompt(
                          tBoard('sharedFilter.presets.promptLabel'),
                          currentPreset?.name ?? tBoard('sharedFilter.presets.defaultName'),
                        )?.trim();
                        if (!name) return;
                        if (currentPreset) updatePreset(currentPreset.id, name);
                        else createPreset(name);
                      }}
                      className="rounded border border-white/10 px-2 py-1 text-[10px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
                    >
                      {currentPreset ? tBoard('sharedFilter.presets.actions.update') : tBoard('sharedFilter.presets.actions.save')}
                    </button>
                  </div>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                  {savedPresets.length === 0 ? (
                    <p className="text-xs text-muted">{tBoard('sharedFilter.presets.empty')}</p>
                  ) : (
                    savedPresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            applyPreset(preset.id);
                            setPresetsOpen(false);
                          }}
                          className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground"
                          title={preset.name}
                        >
                          {preset.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => updatePreset(preset.id)}
                          className="rounded border border-white/10 px-2 py-1 text-[10px] text-muted transition hover:border-accent hover:text-foreground"
                        >
                          {tBoard('sharedFilter.presets.actions.sync')}
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePreset(preset.id)}
                          className="rounded border border-rose-400/30 px-2 py-1 text-[10px] text-rose-200 transition hover:border-rose-300"
                        >
                          {tBoard('sharedFilter.presets.actions.delete')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            </div>
            )}
            {typeof tasksCount === 'number' && (
              <div className="flex items-center gap-2 text-[11px] text-muted tabular-nums">
                <span>
                  {typeof totalTasksCount === 'number'
                    ? `${tasksCount} / ${totalTasksCount}`
                    : tasksCount}{' '}
                  {tBoard(tasksCount === 1 ? 'sharedFilter.bar.task' : 'sharedFilter.bar.tasks')}
                </span>
                {isFiltering && (
                  <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                    {tBoard('sharedFilter.bar.filteredView')}
                  </span>
                )}
              </div>
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
              className={`relative flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-surface/70 px-3 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground`}
              aria-label={tBoard('sharedFilter.bar.openDrawer')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M4 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0Zm10 0a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM7 14a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
              </svg>
              {tBoard('sharedFilter.bar.openDrawer')}
            </button>
          </div>
        </div>

        {showActiveChips && hasChips && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2">
            {visibleChips.map((item) => (
              <Chip
                key={item.key}
                label={item.label}
                onRemove={item.onRemove}
                onClick={item.onClick}
                colorClass={item.colorClass}
              />
            ))}
            {hiddenChipCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllChips(true)}
                className="inline-flex items-center rounded-full border border-white/15 bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-accent hover:text-foreground"
                aria-label={tBoard('sharedFilter.chips.moreAria', { count: hiddenChipCount })}
              >
                +{hiddenChipCount}
              </button>
            )}
            {showAllChips && chipItems.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllChips(false)}
                className="inline-flex items-center rounded-full border border-white/15 bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted transition hover:border-accent hover:text-foreground"
              >
                −
              </button>
            )}
          </div>
        )}
      </div>

      {/* --- Drawer visuel --- */}
      <BoardFilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extraSections={extraDrawerSections}
      />
    </div>
  );
}

export interface BoardActiveFilterChipsProps {
  assigneeOptions: Array<{
    id: string;
    label: string;
    searchText?: string;
    description?: string;
  }>;
  priorityOptions: Array<{ value: PriorityValue; label: string }>;
  effortOptions: Array<{ value: EffortValue; label: string }>;
  maxVisible?: number;
  compact?: boolean;
}

export function BoardActiveFilterChips({
  assigneeOptions,
  priorityOptions,
  effortOptions,
  maxVisible = 8,
  compact = false,
}: BoardActiveFilterChipsProps) {
  const { t: tBoard } = useTranslation('board');
  const {
    filters,
    setSearchQuery,
    setSearchIncludeComments,
    setFilters,
    setAssigneeIds,
    togglePriority,
    toggleEffort,
    setHideDone,
    setOnlyMine,
    resetFilters,
    savedPresets,
  } = useBoardFilters();

  const productivityOptions = useMemo(
    () => [
      { value: 'TODAY', label: tBoard('sharedFilter.productivity.options.TODAY') },
      { value: 'OVERDUE', label: tBoard('sharedFilter.productivity.options.OVERDUE') },
      { value: 'THIS_WEEK', label: tBoard('sharedFilter.productivity.options.THIS_WEEK') },
      { value: 'NEXT_7_DAYS', label: tBoard('sharedFilter.productivity.options.NEXT_7_DAYS') },
      { value: 'NO_DEADLINE', label: tBoard('sharedFilter.productivity.options.NO_DEADLINE') },
    ] as const,
    [tBoard],
  );

  const statusOptions = useMemo(
    () => [
      { value: 'BACKLOG', label: tBoard('behaviors.BACKLOG') },
      { value: 'IN_PROGRESS', label: tBoard('behaviors.IN_PROGRESS') },
      { value: 'BLOCKED', label: tBoard('behaviors.BLOCKED') },
      { value: 'DONE', label: tBoard('behaviors.DONE') },
    ] as const,
    [tBoard],
  );

  const activityPeriodOptions = useMemo(
    () => [
      { value: 'TODAY', label: tBoard('sharedFilter.activity.periods.TODAY') },
      { value: 'LAST_7_DAYS', label: tBoard('sharedFilter.activity.periods.LAST_7_DAYS') },
      { value: 'LAST_30_DAYS', label: tBoard('sharedFilter.activity.periods.LAST_30_DAYS') },
    ] as const,
    [tBoard],
  );

  const activityTypeOptions = useMemo(
    () => [
      { value: 'CREATION', label: tBoard('sharedFilter.activity.types.CREATION') },
      { value: 'MODIFICATION', label: tBoard('sharedFilter.activity.types.MODIFICATION') },
      { value: 'COMMENT', label: tBoard('sharedFilter.activity.types.COMMENT') },
    ] as const,
    [tBoard],
  );

  const currentPreset = useMemo(() => {
    const serialized = JSON.stringify(filters);
    return savedPresets.find((entry) => JSON.stringify(entry.filters) === serialized) ?? null;
  }, [filters, savedPresets]);

  const assigneeLabelMap = useMemo(() => Object.fromEntries(assigneeOptions.map((entry) => [entry.id, entry.label])), [assigneeOptions]);
  const priorityLabelMap = useMemo(() => Object.fromEntries(priorityOptions.map((entry) => [entry.value, entry.label])), [priorityOptions]);
  const effortLabelMap = useMemo(() => Object.fromEntries(effortOptions.map((entry) => [entry.value, entry.label])), [effortOptions]);

  const chipItems = useMemo(() => {
    const items: Array<{ key: string; label: string; onRemove: () => void; colorClass?: string }> = [];

    if (filters.searchQuery.trim().length > 0 || filters.searchIncludeComments) {
      items.push({
        key: 'search',
        label: filters.searchQuery.trim().length > 0
          ? `search: ${filters.searchQuery}${filters.searchIncludeComments ? ' + comments' : ''}`
          : 'search: comments',
        onRemove: () => {
          setSearchQuery('');
          setSearchIncludeComments(false);
        },
        colorClass: 'text-emerald-300',
      });
    }

    if (currentPreset) {
      items.push({
        key: `preset:${currentPreset.id}`,
        label: `preset: ${currentPreset.name}`,
        onRemove: () => resetFilters(),
        colorClass: 'text-fuchsia-300',
      });
    }

    for (const preset of filters.productivityPresets) {
      items.push({
        key: `productivity:${preset}`,
        label: productivityOptions.find((entry) => entry.value === preset)?.label ?? preset,
        onRemove: () => setFilters({ ...filters, productivityPresets: filters.productivityPresets.filter((entry) => entry !== preset) }),
        colorClass: 'text-cyan-300',
      });
    }

    for (const status of filters.statusValues) {
      items.push({
        key: `status:${status}`,
        label: statusOptions.find((entry) => entry.value === status)?.label ?? status,
        onRemove: () => setFilters({ ...filters, statusValues: filters.statusValues.filter((entry) => entry !== status) }),
        colorClass: 'text-orange-300',
      });
    }

    if (filters.activity.period) {
      items.push({
        key: `activity-period:${filters.activity.period}`,
        label: activityPeriodOptions.find((entry) => entry.value === filters.activity.period)?.label ?? filters.activity.period,
        onRemove: () => setFilters({ ...filters, activity: { ...filters.activity, period: null, from: null, to: null } }),
        colorClass: 'text-rose-300',
      });
    }

    for (const type of filters.activity.types) {
      items.push({
        key: `activity-type:${type}`,
        label: activityTypeOptions.find((entry) => entry.value === type)?.label ?? type,
        onRemove: () => setFilters({ ...filters, activity: { ...filters.activity, types: filters.activity.types.filter((entry) => entry !== type) } }),
        colorClass: 'text-rose-300',
      });
    }

    if (filters.onlyMine) {
      items.push({ key: 'mine', label: tBoard('sharedFilter.chips.mine'), onRemove: () => setOnlyMine(false) });
    }

    if (filters.hideDone) {
      items.push({ key: 'hide-done', label: tBoard('sharedFilter.chips.hideDone'), onRemove: () => setHideDone(false) });
    }

    for (const id of filters.assigneeIds) {
      items.push({
        key: `assignee:${id}`,
        label: id === UNASSIGNED_TOKEN ? tBoard('filters.assignees.optionUnassigned.label') : (assigneeLabelMap[id] ?? id),
        onRemove: () => setAssigneeIds(filters.assigneeIds.filter((entry) => entry !== id)),
      });
    }

    for (const value of filters.priorities) {
      items.push({
        key: `priority:${value}`,
        label: priorityLabelMap[value] ?? value,
        onRemove: () => togglePriority(value),
        colorClass: 'text-amber-300',
      });
    }

    for (const value of filters.efforts) {
      items.push({
        key: `effort:${value}`,
        label: value === NO_EFFORT_TOKEN ? tBoard('filters.effort.noEffort') : (effortLabelMap[value as EffortValue] ?? value),
        onRemove: () => toggleEffort(value),
        colorClass: 'text-sky-300',
      });
    }

    return items;
  }, [activityPeriodOptions, activityTypeOptions, assigneeLabelMap, currentPreset, effortLabelMap, filters, priorityLabelMap, productivityOptions, resetFilters, setAssigneeIds, setFilters, setHideDone, setOnlyMine, setSearchIncludeComments, setSearchQuery, statusOptions, tBoard, toggleEffort, togglePriority]);

  if (chipItems.length === 0) {
    return null;
  }

  const visibleChips = chipItems.slice(0, maxVisible);
  const hiddenChipCount = Math.max(0, chipItems.length - visibleChips.length);

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'min-h-8' : ''}`}>
      {visibleChips.map((item) => (
        <Chip key={item.key} label={item.label} onRemove={item.onRemove} colorClass={item.colorClass} />
      ))}
      {hiddenChipCount > 0 && (
        <span className="inline-flex items-center rounded-full border border-white/15 bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-muted">
          +{hiddenChipCount}
        </span>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Chip interne
// --------------------------------------------------------------------------

interface ChipProps {
  label: string;
  onRemove: () => void;
  onClick?: () => void;
  colorClass?: string;
}

function Chip({ label, onRemove, onClick, colorClass }: ChipProps) {
  const { t: tBoard } = useTranslation('board');
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-white/15 bg-surface/80 px-2.5 py-1 text-[11px] font-medium ${colorClass ?? 'text-foreground'}`}
    >
      <button
        type="button"
        onClick={onClick}
        className="max-w-[220px] truncate"
        disabled={!onClick}
      >
        {label}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted transition hover:bg-white/15 hover:text-foreground"
        aria-label={tBoard('sharedFilter.chips.removeAria', { label })}
      >
        <svg viewBox="0 0 8 8" fill="currentColor" className="h-2 w-2" aria-hidden>
          <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}
