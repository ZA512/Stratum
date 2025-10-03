"use client";

import React from 'react';
import { MultiSelectCombo } from '@/components/ui/MultiSelectCombo';
import type { CardDisplayOptions } from './types';

type PriorityValue = 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
type EffortValue = 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL';
const NO_EFFORT_TOKEN = '__NO_EFFORT__' as const;
type EffortFilterValue = EffortValue | typeof NO_EFFORT_TOKEN;

interface AdvancedFiltersPanelProps {
  // Assignees
  assigneeOptions: Array<{ id: string; label: string; description?: string; searchText?: string }>;
  selectedAssignees: string[];
  onAssigneesChange: (ids: string[]) => void;
  
  // Priorities
  priorityOptions: Array<{ value: PriorityValue; label: string }>;
  selectedPriorities: PriorityValue[];
  onTogglePriority: (value: PriorityValue) => void;
  
  // Efforts
  effortOptions: Array<{ value: EffortValue; label: string }>;
  selectedEfforts: EffortFilterValue[];
  onToggleEffort: (value: EffortFilterValue) => void;
  
  // Options
  hideDone: boolean;
  onHideDoneChange: (value: boolean) => void;
  filterHasChildren: boolean;
  onFilterHasChildrenChange: (value: boolean) => void;
  
  // Display
  displayOptions: CardDisplayOptions;
  onToggleDisplayOption: (key: keyof CardDisplayOptions) => void;
  onColumnHeightChange: (height: 'auto' | 'fixed') => void;
  displayToggleConfig: Array<{ key: keyof CardDisplayOptions; label: string }>;
  
  // Actions
  hasActiveFilters: boolean;
  onReset: () => void;
  onClose: () => void;
}

export function AdvancedFiltersPanel({
  assigneeOptions,
  selectedAssignees,
  onAssigneesChange,
  priorityOptions,
  selectedPriorities,
  onTogglePriority,
  effortOptions,
  selectedEfforts,
  onToggleEffort,
  hideDone,
  onHideDoneChange,
  filterHasChildren,
  onFilterHasChildrenChange,
  displayOptions,
  onToggleDisplayOption,
  onColumnHeightChange,
  displayToggleConfig,
  hasActiveFilters,
  onReset,
  onClose,
}: AdvancedFiltersPanelProps) {
  const NO_EFFORT_TOKEN_LOCAL = '__NO_EFFORT__';
  
  return (
    <div className="absolute left-0 right-0 top-full z-40 mt-3">
      <div className="max-h-[75vh] overflow-hidden rounded-2xl border border-white/15 bg-surface/95 shadow-2xl backdrop-blur">
        {/* En-tête avec dégradé subtil */}
        <div className="border-b border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold tracking-wide text-foreground">Filtres avancés</h3>
              <p className="mt-1 text-[11px] text-muted">Affinez votre vue avec des critères combinés</p>
            </div>
            <div className="flex items-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-semibold text-muted transition hover:text-accent"
                >
                  Réinitialiser
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
        
        {/* Contenu avec scroll */}
        <div className="max-h-[calc(75vh-80px)] overflow-y-auto px-6 py-6 scrollbar-thin">
          {/* Grille 2 colonnes sur grands écrans */}
          <div className="grid gap-6 2xl:grid-cols-2 2xl:items-start">
            {/* Colonne gauche */}
            <div className="space-y-6">
              {/* Section 1: Filtres par personne */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Utilisateurs</h4>
                </div>
                <MultiSelectCombo
                  options={assigneeOptions}
                  selectedIds={selectedAssignees}
                  onChange={onAssigneesChange}
                  placeholder="Sélectionner des utilisateurs…"
                  searchPlaceholder="Rechercher…"
                  emptyMessage="Aucun utilisateur assigné"
                  noResultsMessage="Aucun résultat"
                />
                <p className="mt-2 text-[10px] italic text-muted/70">
                  Incluez « Aucun assigné » pour les tâches sans responsable
                </p>
              </section>

              {/* Section 2: Priorités */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Priorités</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${selectedPriorities.includes(option.value) ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selectedPriorities.includes(option.value)}
                        onChange={() => onTogglePriority(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* Section 3: Options générales */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Options</h4>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-xs transition-all ${hideDone ? 'border-accent/50 bg-accent/10 text-foreground' : 'border-white/10 bg-white/5 text-muted hover:border-accent/30'}`}>
                    <input type="checkbox" className="accent-accent" checked={hideDone} onChange={(e) => onHideDoneChange(e.target.checked)} />
                    <span className="font-medium">Masquer colonnes DONE</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-xs transition-all ${filterHasChildren ? 'border-accent/50 bg-accent/10 text-foreground' : 'border-white/10 bg-white/5 text-muted hover:border-accent/30'}`}>
                    <input type="checkbox" className="accent-accent" checked={filterHasChildren} onChange={(e) => onFilterHasChildrenChange(e.target.checked)} />
                    <span className="font-medium">Avec sous-kanban uniquement</span>
                  </label>
                </div>
              </section>
            </div>

            {/* Colonne droite */}
            <div className="space-y-6">
              {/* Section 4: Efforts */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Efforts</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${selectedEfforts.includes(NO_EFFORT_TOKEN_LOCAL as EffortFilterValue) ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedEfforts.includes(NO_EFFORT_TOKEN_LOCAL as EffortFilterValue)}
                      onChange={() => onToggleEffort(NO_EFFORT_TOKEN_LOCAL as EffortFilterValue)}
                    />
                    Sans effort
                  </label>
                  {effortOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${selectedEfforts.includes(option.value) ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selectedEfforts.includes(option.value)}
                        onChange={() => onToggleEffort(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </section>

              {/* Section 5: Affichage des colonnes */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Colonnes</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onColumnHeightChange('auto')}
                    className={`rounded-full border px-4 py-2 text-[11px] font-semibold transition-all ${displayOptions.columnHeight === 'auto' ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}
                  >
                    Hauteur illimitée
                  </button>
                  <button
                    type="button"
                    onClick={() => onColumnHeightChange('fixed')}
                    className={`rounded-full border px-4 py-2 text-[11px] font-semibold transition-all ${displayOptions.columnHeight === 'fixed' ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}
                  >
                    Avec défilement
                  </button>
                </div>
              </section>

              {/* Section 6: Affichage des cartes */}
              <section className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">Visibilité des cartes</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayToggleConfig.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleDisplayOption(key)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all ${displayOptions[key] ? 'border-accent bg-accent/15 text-foreground shadow-sm' : 'border-white/15 text-muted hover:border-accent/50 hover:bg-white/5'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
