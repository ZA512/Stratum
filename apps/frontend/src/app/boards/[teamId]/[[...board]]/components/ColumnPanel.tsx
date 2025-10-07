"use client";
import React from 'react';
import { useDroppable, type DraggableSyntheticListeners, type DraggableAttributes } from '@dnd-kit/core';
import type { BoardColumnWithNodes, CardDisplayOptions, ColumnEditingValues } from './types';
import { BEHAVIOR_COLOR_CLASSES, BEHAVIOR_LABELS } from './constants';
import { AddCardForm } from './AddCardForm';
import { BoardTaskCard } from './BoardTaskCard';
import type { BoardNode, NodeChildBoard, ArchivedBoardNode } from '@/features/boards/boards-api';
import { readBacklogSettings, readDoneSettings } from './settings-helpers';

const BACKLOG_DEFAULTS = Object.freeze({
  reviewAfterDays: 14,
  reviewEveryDays: 7,
  archiveAfterDays: 60,
});

const DONE_DEFAULTS = Object.freeze({
  archiveAfterDays: 30,
});

interface ColumnPanelProps {
  column: BoardColumnWithNodes;
  cards: BoardNode[];
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  editingValues: ColumnEditingValues | null;
  onRequestEdit: (columnId: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void; // actual payload handled upstream
  onFieldChange: (
    field:
      | 'name'
      | 'wip'
      | 'backlogReviewAfter'
      | 'backlogReviewEvery'
      | 'backlogArchiveAfter'
      | 'doneArchiveAfter',
    value: string,
  ) => void;
  onMove: (direction: -1|1) => void;
  onDelete: () => void;
  onCreateCard: (title: string) => Promise<void> | void;
  onOpenCard: (id: string) => void;              // ouvre le drawer tâche
  onOpenChildBoard?: (boardId: string) => void; // navigation vers sous-board
  onRenameCard: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMoveCard: (node: BoardNode) => void;
  onRequestDeleteCard: (node: BoardNode) => void;
  childBoards: Record<string, NodeChildBoard>;
  loadingCards: boolean;
  displayOptions: CardDisplayOptions;
  dragStyle?: React.CSSProperties;
  dragHandleListeners?: DraggableSyntheticListeners;
  dragHandleAttributes?: DraggableAttributes;
  dragHandleRef?: (element: HTMLElement | null) => void;
  isColumnDragging?: boolean;
  onShowArchived?: (column: BoardColumnWithNodes) => void;
  onShowSnoozed?: (column: BoardColumnWithNodes) => void;
  snoozedOpen?: boolean;
  viewMode?: 'snoozed' | 'archived' | null;
  archivedNodes?: ArchivedBoardNode[];
}

export const ColumnPanel = React.forwardRef<HTMLDivElement, ColumnPanelProps>(function ColumnPanel(props, ref) {
  const {
    column, cards, isEditing, isFirst, isLast, editingValues,
    onRequestEdit, onCancelEdit, onSubmitEdit, onFieldChange,
    onMove, onDelete, onCreateCard, onOpenCard, onRenameCard,
    onRequestMoveCard, onRequestDeleteCard,
    childBoards, loadingCards, displayOptions, onOpenChildBoard,
    dragStyle, dragHandleListeners, dragHandleAttributes, dragHandleRef,
    isColumnDragging, onShowArchived, onShowSnoozed, snoozedOpen,
    viewMode, archivedNodes,
  } = props;

  const colorClass = BEHAVIOR_COLOR_CLASSES[column.behaviorKey] || '';
  // Zone de drop par colonne (utile quand aucune carte)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id, data: { type: 'column-drop' } });
  const activatorAttributes = dragHandleAttributes ?? ({} as DraggableAttributes);
  const activatorListeners = dragHandleListeners ?? ({} as DraggableSyntheticListeners);
  const handleRef = (node: HTMLButtonElement | null) => {
    dragHandleRef?.(node);
  };

  const backlogSnapshot =
    column.behaviorKey === 'BACKLOG'
      ? readBacklogSettings(column.settings ?? null)
      : null;
  const doneSnapshot =
    column.behaviorKey === 'DONE'
      ? readDoneSettings(column.settings ?? null)
      : null;

  // Utiliser les valeurs par défaut si settings est null (colonne pas encore configurée)
  const backlogReviewAfter = backlogSnapshot?.reviewAfterDays ?? (column.behaviorKey === 'BACKLOG' ? 14 : null);
  const backlogReviewEvery = backlogSnapshot?.reviewEveryDays ?? (column.behaviorKey === 'BACKLOG' ? 7 : null);
  const backlogArchiveAfter = backlogSnapshot?.archiveAfterDays ?? (column.behaviorKey === 'BACKLOG' ? 60 : null);
  const doneArchiveAfter = doneSnapshot?.archiveAfterDays ?? (column.behaviorKey === 'DONE' ? 30 : null);

  const archivedCount = column.badges?.archived ?? 0;
  const snoozedCount = column.badges?.snoozed ?? 0;
  const archivedButtonProps = {
    type: 'button' as const,
    onClick: () => onShowArchived?.(column),
    disabled: !onShowArchived,
    className:
      'rounded-full border border-white/10 bg-surface/70 px-2 py-1 text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60',
    title: 'Afficher les tâches archivées de la colonne',
    'aria-label': `Afficher les tâches archivées pour ${column.name}`,
  } satisfies React.ComponentProps<'button'>;

  return (
    // Largeur fixe pour uniformiser toutes les colonnes
    <div
      ref={ref}
      style={dragStyle}
      className={`w-[320px] shrink-0 rounded-2xl border border-white/10 bg-card/80 p-5 shadow-lg relative ${isColumnDragging ? 'ring-2 ring-accent/40 ring-offset-2 ring-offset-background' : ''}`}
    >
      <div className={`absolute left-0 top-0 h-1 w-full rounded-t-2xl ${colorClass}`} />
      <header className="flex items-start justify-between gap-3 pb-2 border-b border-white/10">
        <div>
          <h3 className="text-lg font-semibold">{column.name}</h3>
          <p className="text-[11px] uppercase tracking-wide text-muted">{BEHAVIOR_LABELS[column.behaviorKey as keyof typeof BEHAVIOR_LABELS] || column.behaviorKey}</p>
        </div>
        <div className="flex items-start gap-2">
          <button
            type="button"
            ref={handleRef}
            {...activatorAttributes}
            {...activatorListeners}
            className="rounded-full border border-white/10 bg-surface/70 px-2 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground cursor-grab active:cursor-grabbing"
            aria-label="Déplacer la colonne"
          >
            ⠿
          </button>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full border border-white/10 bg-surface/70 px-3 py-1 text-[11px] uppercase tracking-wide text-muted" title={typeof column.wipLimit==='number'?`Limite WIP ${column.wipLimit}`:'Pas de limite WIP'}>
              {typeof column.wipLimit==='number'?`WIP ${column.wipLimit}`:'∞'}
            </span>
            <button
              onClick={()=> isEditing? onCancelEdit(): onRequestEdit(column.id)}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground"
            >
              {isEditing? 'Fermer':'Gérer'}
            </button>
          </div>
        </div>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted overflow-visible">
        {column.behaviorKey === 'BACKLOG' && (
          <>
            {backlogArchiveAfter && backlogArchiveAfter > 0 ? (
              <div className="group relative">
                <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-1 cursor-help">
                  📦 Archivage : {backlogArchiveAfter}j
                </span>
                <div className="pointer-events-none absolute top-full left-1/2 z-[9999] mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-orange-500/20 bg-slate-800 p-3 text-xs shadow-2xl group-hover:block">
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-orange-500/20 bg-slate-800"></div>
                  <h4 className="mb-1 font-semibold text-orange-400">📦 Archivage automatique</h4>
                  <p className="text-slate-300">Les cartes <strong>non traitées</strong> pendant {backlogArchiveAfter} jours sont automatiquement archivées.</p>
                  <p className="mt-1 text-slate-300">Le compteur est <strong>remis à zéro</strong> à chaque interaction (ouverture, modification, reset manuel).</p>
                  <p className="mt-2 text-[10px] text-slate-400">💡 Cliquez sur "♻️ Garder" dans la carte pour confirmer son intérêt et réinitialiser le compteur.</p>
                </div>
              </div>
            ) : (
              <div className="group relative">
                <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-1 cursor-help text-slate-400">
                  🚫 Pas d'archivage auto
                </span>
                <div className="pointer-events-none absolute top-full left-1/2 z-[9999] mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-slate-500/20 bg-slate-800 p-3 text-xs shadow-2xl group-hover:block">
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-slate-500/20 bg-slate-800"></div>
                  <h4 className="mb-1 font-semibold text-slate-400">🚫 Archivage désactivé</h4>
                  <p className="text-slate-300">Les cartes ne sont <strong>jamais archivées automatiquement</strong> pour cette colonne.</p>
                  <p className="mt-2 text-[10px] text-slate-400">💡 Pour activer l'archivage automatique, cliquez sur <strong>"Gérer"</strong> et définissez un délai en jours.</p>
                </div>
              </div>
            )}
            
            {snoozedCount > 0 && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onShowSnoozed?.(column)}
                  disabled={!onShowSnoozed}
                  className={`rounded-full border px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    viewMode === 'snoozed'
                      ? 'border-cyan-400 bg-cyan-500/30 text-cyan-100'
                      : 'border-cyan-500/30 bg-cyan-500/10 hover:border-cyan-400 hover:bg-cyan-500/20'
                  }`}
                  title={viewMode === 'snoozed' ? 'Revenir aux tâches normales' : 'Afficher les tâches en snooze'}
                  aria-label={`${viewMode === 'snoozed' ? 'Masquer' : 'Afficher'} les ${snoozedCount} tâche(s) en snooze pour ${column.name}`}
                >
                  😴 {snoozedCount}
                </button>
                <div className="pointer-events-none absolute top-full left-1/2 z-[9999] mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-cyan-500/20 bg-slate-800 p-3 text-xs shadow-2xl group-hover:block">
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-cyan-500/20 bg-slate-800"></div>
                  <h4 className="mb-1 font-semibold text-cyan-400">😴 Cartes en snooze</h4>
                  <p className="text-slate-300">Nombre de cartes <strong>masquées temporairement</strong> jusqu'à une date choisie par vous.</p>
                  <p className="mt-1 text-slate-300">Le snooze <strong>réinitialise le compteur d'archive</strong> automatiquement.</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">Cliquez pour {viewMode === 'snoozed' ? 'revenir' : 'voir les cartes reportées'}</p>
                </div>
              </div>
            )}
            
            {archivedCount > 0 && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onShowArchived?.(column)}
                  disabled={!onShowArchived}
                  className={`rounded-full border px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    viewMode === 'archived'
                      ? 'border-amber-400 bg-amber-500/30 text-amber-100'
                      : 'border-slate-500/30 bg-slate-500/10 hover:border-slate-400 hover:bg-slate-500/20'
                  }`}
                  title={viewMode === 'archived' ? 'Revenir aux tâches normales' : 'Afficher les tâches archivées'}
                  aria-label={`${viewMode === 'archived' ? 'Masquer' : 'Afficher'} les ${archivedCount} tâche(s) archivées pour ${column.name}`}
                >
                  📦 {archivedCount}
                </button>
                <div className="pointer-events-none absolute top-full left-1/2 z-[9999] mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-500/20 bg-slate-800 p-3 text-xs shadow-2xl group-hover:block">
                  <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-slate-500/20 bg-slate-800"></div>
                  <h4 className="mb-1 font-semibold text-slate-400">📦 Cartes archivées</h4>
                  <p className="text-slate-300">Cartes archivées automatiquement après {backlogArchiveAfter ?? 60} jours d'inactivité.</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">Cliquez pour {viewMode === 'archived' ? 'revenir' : 'voir les cartes archivées'}</p>
                </div>
              </div>
            )}
          </>
        )}
        {column.behaviorKey === 'DONE' && (
          <>
            <span className="rounded-full border border-white/10 bg-surface/70 px-2 py-1">
              Archive J+{doneArchiveAfter ?? DONE_DEFAULTS.archiveAfterDays}
            </span>
            <button {...archivedButtonProps}>
              Archivé·es {archivedCount}
            </button>
          </>
        )}
        {column.behaviorKey !== 'BACKLOG' && column.behaviorKey !== 'DONE' && archivedCount > 0 && (
          <button {...archivedButtonProps}>
            Archivé·es {archivedCount}
          </button>
        )}
      </div>
      {isEditing && editingValues && (
        <form onSubmit={(e)=> { e.preventDefault(); onSubmitEdit(); }} className="mt-4 space-y-3 rounded-xl border border-white/10 bg-surface/60 p-4">
          <label className="text-xs text-muted">Nom
            <input
              value={editingValues.name}
              onChange={e=>onFieldChange('name', e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="text-xs text-muted">Limite WIP
            <input
              value={editingValues.wip}
              onChange={e=>onFieldChange('wip', e.target.value)}
              placeholder="Illimité"
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          {column.behaviorKey === 'BACKLOG' && (
            <label className="text-xs text-muted">Archivage auto (jours)
              <input
                value={editingValues.backlogArchiveAfter}
                onChange={(e) => onFieldChange('backlogArchiveAfter', e.target.value)}
                placeholder="Laisser vide pour désactiver"
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className="mt-1 text-[11px] text-slate-500">Laissez vide ou zéro pour désactiver l'archivage automatique</p>
            </label>
          )}
          {column.behaviorKey === 'DONE' && (
            <label className="text-xs text-muted">Archivage auto (jours)
              <input
                value={editingValues.doneArchiveAfter}
                onChange={(e) => onFieldChange('doneArchiveAfter', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={editingValues.submitting} className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">Enregistrer</button>
            <button type="button" onClick={onCancelEdit} className="text-xs text-muted hover:text-foreground">Annuler</button>
            <button type="button" onClick={onDelete} disabled={editingValues.submitting} className="ml-auto rounded-full border border-red-500/40 px-3 py-1 text-[11px] uppercase tracking-wide text-red-300 transition hover:border-red-200 disabled:opacity-60">Supprimer</button>
          </div>
          {editingValues.error && <p className="text-xs text-red-300">{editingValues.error}</p>}
        </form>
      )}
      <div className="mt-4 border-t border-white/10 pt-4">
        <AddCardForm onCreate={onCreateCard} disabled={loadingCards} />
      </div>
      <div 
        className={`mt-4 rounded-xl transition ${isOver? 'ring-2 ring-accent/50 ring-offset-2 ring-offset-background':''} ${displayOptions.columnHeight === 'fixed' ? 'max-h-[calc(100vh-400px)] overflow-y-auto scrollbar-thin scrollbar-thumb-accent/40 scrollbar-track-transparent hover:scrollbar-thumb-accent/60' : ''}`} 
        ref={setDropRef}
      >
        {viewMode === 'archived' ? (
          // Mode archivé
          archivedNodes && archivedNodes.length > 0 ? (
            <div className="space-y-3">
              {archivedNodes.map(node => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onOpenCard(node.id)}
                  className="w-full rounded-xl border border-white/10 bg-surface/80 p-3 text-left transition hover:border-accent/40 hover:bg-surface"
                >
                  <p className="text-sm font-semibold">{node.shortId ? `#${node.shortId} ` : ''}{node.title}</p>
                  <p className="text-xs text-muted">Archivée le {node.archivedAt ? new Date(node.archivedAt).toLocaleString('fr-FR') : '—'}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="min-h-[48px] rounded-xl border border-dashed border-white/10 bg-surface/40 px-4 py-4 text-sm text-muted">Aucune carte archivée</p>
          )
        ) : cards.length === 0 ? (
          <p className={`min-h-[48px] rounded-xl border border-dashed ${isOver? 'border-accent/60 bg-accent/10':'border-white/10 bg-surface/40'} px-4 py-4 text-sm text-muted`}>
            {viewMode === 'snoozed' ? 'Aucune carte reportée' : 'Aucune carte'}
          </p>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <BoardTaskCard
                key={card.id}
                node={card}
                columnId={column.id}
                columnBehavior={column.behaviorKey}
                childBoard={childBoards[card.id]}
                onOpen={onOpenCard}
                onOpenChildBoard={onOpenChildBoard}
                onRename={onRenameCard}
                onRequestMove={onRequestMoveCard}
                onRequestDelete={onRequestDeleteCard}
                displayOptions={displayOptions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
