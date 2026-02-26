'use client';

/**
 * BoardFilterDrawer — Panneau de filtres partagés, slide depuis la droite.
 *
 * Accessible depuis toutes les vues via le bouton "Filtres" dans BoardFilterBar.
 * Gère les 6 filtres universels : assignés, priorités, efforts, masquer DONE,
 * et "mes tâches".
 *
 * Les filtres spécifiques à la vue (options d'affichage Kanban, scope Liste,
 * layout Mindmap…) restent dans leurs panneaux respectifs.
 */

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import { MultiSelectCombo } from '@/components/ui/MultiSelectCombo';
import { useBoardFilters } from '../context/BoardFilterContext';
import type { PriorityValue, EffortValue, EffortFilterValue } from '../types/board-filters';
import { NO_EFFORT_TOKEN } from '../types/board-filters';

// --------------------------------------------------------------------------
// Props
// --------------------------------------------------------------------------

interface BoardFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  assigneeOptions: Array<{
    id: string;
    label: string;
    searchText?: string;
    description?: string;
  }>;
  priorityOptions: Array<{ value: PriorityValue; label: string }>;
  effortOptions: Array<{ value: EffortValue; label: string }>;
  /** Sections supplémentaires spécifiques à la vue, ajoutées après les filtres partagés */
  extraSections?: React.ReactNode;
}

// --------------------------------------------------------------------------
// Composant
// --------------------------------------------------------------------------

export function BoardFilterDrawer({
  open,
  onClose,
  assigneeOptions,
  priorityOptions,
  effortOptions,
  extraSections,
}: BoardFilterDrawerProps) {
  const { t: tBoard } = useTranslation('board');
  const {
    filters,
    setAssigneeIds,
    togglePriority,
    toggleEffort,
    setHideDone,
    setOnlyMine,
    resetFilters,
    activeFilterCount,
  } = useBoardFilters();

  // Fermer avec Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (typeof window === 'undefined') return null;

  const drawer = (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panneau latéral */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[400px] max-w-[90vw] flex-col border-l border-white/10 bg-background/98 shadow-2xl backdrop-blur transition-transform duration-200 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label={tBoard('sharedFilter.drawer.title')}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {tBoard('sharedFilter.drawer.title')}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {tBoard('sharedFilter.drawer.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-muted transition hover:text-accent"
              >
                {tBoard('filters.actions.reset')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
              aria-label={tBoard('filters.actions.close')}
            >
              <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5" aria-hidden>
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">

          {/* --- Section Mes tâches + Masquer terminées --- */}
          <DrawerSection title={tBoard('sharedFilter.drawer.sections.quick')}>
            <div className="flex flex-col gap-2.5">
              <ToggleRow
                label={tBoard('sharedFilter.chips.mine')}
                description={tBoard('sharedFilter.drawer.onlyMine.description')}
                checked={filters.onlyMine}
                onChange={setOnlyMine}
              />
              <ToggleRow
                label={tBoard('sharedFilter.chips.hideDone')}
                description={tBoard('sharedFilter.drawer.hideDone.description')}
                checked={filters.hideDone}
                onChange={setHideDone}
              />
            </div>
          </DrawerSection>

          {/* --- Section Assignés --- */}
          <DrawerSection title={tBoard('filters.assignees.title')}>
            <MultiSelectCombo
              options={assigneeOptions}
              selectedIds={filters.assigneeIds}
              onChange={setAssigneeIds}
              placeholder={tBoard('filters.assignees.placeholder')}
              searchPlaceholder={tBoard('filters.assignees.searchPlaceholder')}
              emptyMessage={tBoard('filters.assignees.empty')}
              noResultsMessage={tBoard('filters.assignees.noResults')}
              keepMenuOpen
            />
          </DrawerSection>

          {/* --- Section Priorités --- */}
          <DrawerSection title={tBoard('filters.priority.title')}>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map((option) => {
                const active = filters.priorities.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => togglePriority(option.value)}
                    className={`rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition-all ${active ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5 hover:text-foreground'}`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </DrawerSection>

          {/* --- Section Efforts --- */}
          <DrawerSection title={tBoard('filters.effort.title')}>
            <div className="flex flex-wrap gap-2">
              {/* Token "Sans effort" */}
              {(() => {
                const active = filters.efforts.includes(NO_EFFORT_TOKEN);
                return (
                  <button
                    type="button"
                    onClick={() => toggleEffort(NO_EFFORT_TOKEN)}
                    className={`rounded-full border px-3.5 py-1.5 text-[11px] font-medium italic transition-all ${active ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5 hover:text-foreground'}`}
                    aria-pressed={active}
                  >
                    {tBoard('filters.effort.noEffort')}
                  </button>
                );
              })()}
              {effortOptions.map((option) => {
                const active = filters.efforts.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleEffort(option.value)}
                    className={`rounded-full border px-3.5 py-1.5 text-[11px] font-medium transition-all ${active ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5 hover:text-foreground'}`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </DrawerSection>

          {/* --- Sections spécifiques à la vue (injectées par le parent) --- */}
          {extraSections}

        </div>

        {/* Footer */}
        {activeFilterCount > 0 && (
          <div className="border-t border-white/10 px-5 py-4">
            <button
              type="button"
              onClick={() => { resetFilters(); onClose(); }}
              className="w-full rounded-full border border-white/15 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground"
            >
              {tBoard('filters.actions.reset')}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(drawer, document.body);
}

// --------------------------------------------------------------------------
// Sous-composants internes
// --------------------------------------------------------------------------

export function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted/70">
        {title}
      </h3>
      {children}
    </section>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

export function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all ${checked ? 'border-accent/40 bg-accent/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}
    >
      <div>
        <p className={`text-xs font-medium ${checked ? 'text-foreground' : 'text-muted'}`}>{label}</p>
        {description && <p className="mt-0.5 text-[10px] text-muted/70">{description}</p>}
      </div>
      {/* Toggle visuel */}
      <div
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
        role="presentation"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${checked ? 'left-auto right-0.5' : 'left-0.5'}`}
        />
      </div>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
