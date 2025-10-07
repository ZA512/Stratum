"use client";
import React from 'react';
import { useDroppable, type DraggableSyntheticListeners, type DraggableAttributes } from '@dnd-kit/core';
import { AlarmClock, Archive, Gauge, GripVertical, Layers, Settings2 } from 'lucide-react';
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

const HATCHED_SURFACE = 'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0,rgba(255,255,255,0.08)_8px,rgba(255,255,255,0)_8px,rgba(255,255,255,0)_16px)]';
const HATCHED_ACCENT = 'bg-[repeating-linear-gradient(135deg,rgba(127,216,255,0.16)_0,rgba(127,216,255,0.16)_8px,rgba(255,255,255,0)_8px,rgba(255,255,255,0)_16px)]';

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
  helpMode?: boolean;
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
    viewMode, archivedNodes, helpMode,
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
  const behaviorLabel = BEHAVIOR_LABELS[column.behaviorKey as keyof typeof BEHAVIOR_LABELS] || column.behaviorKey;
  const backlogArchiveDelay = backlogArchiveAfter == null ? null : backlogArchiveAfter;
  const backlogArchiveBadge = backlogArchiveDelay == null ? '∞' : `${backlogArchiveDelay} j`;
  const backlogArchiveTooltip = backlogArchiveDelay == null || backlogArchiveDelay === 0
    ? 'Archivage automatique désactivé : les cartes restent ici tant que vous ne les archivez pas manuellement.'
    : `Les cartes sont archivées après ${backlogArchiveDelay} jour(s) d\'inactivité. Mettez la valeur à 0 ou laissez vide pour désactiver l\'archivage automatique.`;
  const doneArchiveDelay = doneArchiveAfter ?? DONE_DEFAULTS.archiveAfterDays;
  const doneArchiveBadge = `J+${doneArchiveDelay}`;
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
      <header className="border-b border-white/10 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold" title={column.name}>{column.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="group relative">
              <span
                className="flex items-center gap-1 rounded-full border border-dashed border-white/20 bg-surface/70 px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted"
                aria-label={typeof column.wipLimit === 'number' ? `Limite WIP fixée à ${column.wipLimit}` : 'Aucune limite WIP'}
                role="status"
              >
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{typeof column.wipLimit === 'number' ? column.wipLimit : '∞'}</span>
              </span>
              {helpMode && (
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                  <p>{typeof column.wipLimit === 'number' ? `Vous avez défini une limite de ${column.wipLimit} carte(s) simultanées pour fluidifier le flux.` : 'Aucune limite de WIP : la colonne accepte un nombre illimité de cartes.'}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Astuce : ajustez cette limite dans les paramètres de colonne.</p>
                </div>
              )}
            </div>
            <div className="group relative">
              <button
                type="button"
                ref={handleRef}
                {...activatorAttributes}
                {...activatorListeners}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-solid border-white/20 bg-surface/70 text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 cursor-grab active:cursor-grabbing"
                aria-label="Déplacer la colonne"
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
              {helpMode && (
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-52 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                  <p>Glissez-déposez ce bouton pour réordonner les colonnes du tableau.</p>
                </div>
              )}
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => (isEditing ? onCancelEdit() : onRequestEdit(column.id))}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-solid bg-surface/70 text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isEditing ? 'border-accent text-foreground' : 'border-white/20'}`}
                aria-label={isEditing ? 'Fermer les paramètres de la colonne' : 'Ouvrir les paramètres de la colonne'}
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </button>
              {helpMode && (
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-60 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                  role="tooltip"
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                  <p>{isEditing ? 'Fermez le panneau de paramétrage.' : 'Configurez le nom, la limite WIP et les automatisations de cette colonne.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <div className="group relative">
              <span className="flex items-center gap-1 rounded-full border border-dashed border-white/20 bg-surface/70 px-2.5 py-1 font-medium uppercase tracking-wide" role="status">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{behaviorLabel}</span>
              </span>
              {helpMode && (
                <div
                  className="pointer-events-none invisible absolute top-full left-0 z-[9999] mt-2 w-72 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                  <p>Type de colonne : {behaviorLabel}. Certains comportements (archivage, déplacement auto…) sont activés automatiquement.</p>
                </div>
              )}
            </div>
            {(column.behaviorKey === 'BACKLOG' || column.behaviorKey === 'DONE') && (
              <div className="group relative">
                <span className="flex items-center gap-1 rounded-full border border-dashed border-white/20 bg-surface/70 px-2.5 py-1 font-medium" role="status">
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {column.behaviorKey === 'BACKLOG' ? backlogArchiveBadge : doneArchiveBadge}
                  </span>
                </span>
                {helpMode && (
                  <div
                    className="pointer-events-none invisible absolute top-full left-0 z-[9999] mt-2 w-72 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                    style={{ transitionDelay: '150ms' }}
                  >
                    <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                    {column.behaviorKey === 'BACKLOG' ? (
                      <>
                        <p>{backlogArchiveTooltip}</p>
                        <p className="mt-1 text-[10px] text-slate-400">Dans une carte, utilisez le bouton « ♻️ Garder » pour remettre le compteur à zéro manuellement.</p>
                      </>
                    ) : (
                      <>
                        <p>Les cartes faites sont archivées automatiquement {doneArchiveDelay} jour(s) après leur arrivée.</p>
                        <p className="mt-1 text-[10px] text-slate-400">Ajustez le délai dans les paramètres de colonne si besoin.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {column.behaviorKey === 'BACKLOG' && (snoozedCount > 0 || viewMode === 'snoozed') && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onShowSnoozed?.(column)}
                  disabled={!onShowSnoozed}
                  className={`flex items-center gap-1 rounded-full border border-solid px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    viewMode === 'snoozed'
                      ? 'border-cyan-400 bg-cyan-500/30 text-cyan-100'
                      : 'border-white/20 bg-surface/70 text-muted hover:border-cyan-300 hover:bg-cyan-500/10 hover:text-foreground'
                  }`}
                  aria-label={`${viewMode === 'snoozed' ? 'Masquer' : 'Afficher'} les ${snoozedCount} tâche(s) en snooze pour ${column.name}`}
                >
                  <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{snoozedCount}</span>
                </button>
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg border border-cyan-500/20 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-cyan-500/20 bg-slate-900/95" />
                  <h4 className="mb-1 font-semibold text-cyan-300">Cartes en snooze</h4>
                  <p>Affichez ou masque les cartes reportées temporairement. Le snooze remet le compteur d&apos;archivage à zéro.</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">Cliquez pour {viewMode === 'snoozed' ? 'revenir à la vue normale' : 'voir les cartes reportées'}.</p>
                </div>
              </div>
            )}
            {(archivedCount > 0 || viewMode === 'archived') && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onShowArchived?.(column)}
                  disabled={!onShowArchived}
                  className={`flex items-center gap-1 rounded-full border border-solid px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    viewMode === 'archived'
                      ? 'border-amber-400 bg-amber-500/30 text-amber-100'
                      : 'border-white/20 bg-surface/70 text-muted hover:border-amber-300 hover:text-foreground'
                  }`}
                  aria-label={`${viewMode === 'archived' ? 'Masquer' : 'Afficher'} les ${archivedCount} tâche(s) archivées pour ${column.name}`}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{archivedCount}</span>
                </button>
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg border border-amber-400/20 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-amber-400/20 bg-slate-900/95" />
                  <h4 className="mb-1 font-semibold text-amber-300">Cartes archivées</h4>
                  <p>Consultez les éléments sortis du flux actif. Le délai dépend du paramètre d&apos;archivage automatique.</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">Cliquez pour {viewMode === 'archived' ? 'revenir aux cartes actives' : 'voir les cartes archivées'}.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
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
      <div className="mt-4">
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
