"use client";
import React, { useMemo } from 'react';
import { useDroppable, type DraggableSyntheticListeners, type DraggableAttributes } from '@dnd-kit/core';
import { AlarmClock, Archive, Gauge, GripVertical, Layers, Settings2 } from 'lucide-react';
import type { BoardColumnWithNodes, CardDisplayOptions, ColumnEditingValues } from './types';
import { BEHAVIOR_COLOR_CLASSES } from './constants';
import { AddCardForm } from './AddCardForm';
import { BoardTaskCard } from './BoardTaskCard';
import type { BoardNode, NodeChildBoard, ArchivedBoardNode } from '@/features/boards/boards-api';
import { readBacklogSettings, readDoneSettings } from './settings-helpers';
import { useTranslation } from '@/i18n';
import { HelpTooltip } from '@/components/ui/help-tooltip';

const DONE_DEFAULTS = Object.freeze({
  archiveAfterDays: 30,
});

interface ColumnPanelProps {
  column: BoardColumnWithNodes;
  cards: BoardNode[];
  isEditing: boolean;
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
  viewMode?: 'snoozed' | 'archived' | null;
  archivedNodes?: ArchivedBoardNode[];
  helpMode?: boolean;
}

export const ColumnPanel = React.forwardRef<HTMLDivElement, ColumnPanelProps>(function ColumnPanel(props, ref) {
  const {
    column, cards, isEditing, editingValues,
    onRequestEdit, onCancelEdit, onSubmitEdit, onFieldChange,
    onDelete, onCreateCard, onOpenCard, onRenameCard,
    onRequestMoveCard, onRequestDeleteCard,
    childBoards, loadingCards, displayOptions, onOpenChildBoard,
    dragStyle, dragHandleListeners, dragHandleAttributes, dragHandleRef,
    isColumnDragging, onShowArchived, onShowSnoozed,
    viewMode, archivedNodes, helpMode,
  } = props;

  const { t: tBoard, locale } = useTranslation("board");
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
  const backlogArchiveAfter = backlogSnapshot?.archiveAfterDays ?? (column.behaviorKey === 'BACKLOG' ? 60 : null);
  const doneArchiveAfter = doneSnapshot?.archiveAfterDays ?? (column.behaviorKey === 'DONE' ? 30 : null);

  const archivedCount = column.badges?.archived ?? 0;
  const snoozedCount = column.badges?.snoozed ?? 0;
  const behaviorLabel = useMemo(() => tBoard(`behaviors.${column.behaviorKey}` as const), [tBoard, column.behaviorKey]);
  const backlogArchiveDelay = backlogArchiveAfter == null ? null : backlogArchiveAfter;
  const backlogArchiveBadge = backlogArchiveDelay == null ? '∞' : `${backlogArchiveDelay} j`;
  const backlogArchiveTooltip = backlogArchiveDelay == null || backlogArchiveDelay === 0
    ? tBoard('columns.archive.backlog.disabled')
    : tBoard('columns.archive.backlog.enabled', { days: backlogArchiveDelay });
  const doneArchiveDelay = doneArchiveAfter ?? DONE_DEFAULTS.archiveAfterDays;
  const doneArchiveBadge = `J+${doneArchiveDelay}`;
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
                aria-label={typeof column.wipLimit === 'number'
                  ? tBoard('columns.wip.ariaLimited', { limit: column.wipLimit })
                  : tBoard('columns.wip.ariaUnlimited')}
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
                  <p>{typeof column.wipLimit === 'number'
                    ? tBoard('columns.wip.helpLimited', { limit: column.wipLimit })
                    : tBoard('columns.wip.helpUnlimited')}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{tBoard('columns.wip.helpHint')}</p>
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
                aria-label={tBoard('columns.reorder.aria')}
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
              {helpMode && (
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-52 rounded-lg border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-white/10 bg-slate-900/95" />
                  <p>{tBoard('columns.reorder.help')}</p>
                </div>
              )}
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => (isEditing ? onCancelEdit() : onRequestEdit(column.id))}
                className={`flex h-8 w-8 items-center justify-center rounded-full border border-solid bg-surface/70 text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isEditing ? 'border-accent text-foreground' : 'border-white/20'}`}
                aria-label={isEditing ? tBoard('columns.settings.closeAria') : tBoard('columns.settings.openAria')}
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
                  <p>{isEditing ? tBoard('columns.settings.helpClose') : tBoard('columns.settings.helpOpen')}</p>
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
                  <p className="font-semibold text-accent mb-1">{behaviorLabel}</p>
                  <p>{tBoard(`columns.behavior.${column.behaviorKey}`)}</p>
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
                        <p className="mt-1 text-[10px] text-slate-400">{tBoard('columns.archive.backlog.hint')}</p>
                      </>
                    ) : (
                      <>
                        <p>{tBoard('columns.archive.done.tooltip', { days: doneArchiveDelay })}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{tBoard('columns.archive.done.hint')}</p>
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
                  aria-label={tBoard(viewMode === 'snoozed' ? 'columns.snoozed.aria.hide' : 'columns.snoozed.aria.show', {
                    count: snoozedCount,
                    name: column.name,
                  })}
                >
                  <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{snoozedCount}</span>
                </button>
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg border border-cyan-500/20 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-cyan-500/20 bg-slate-900/95" />
                  <h4 className="mb-1 font-semibold text-cyan-300">{tBoard('columns.snoozed.title')}</h4>
                  <p>{tBoard('columns.snoozed.body')}</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">{tBoard(viewMode === 'snoozed' ? 'columns.snoozed.cta.hide' : 'columns.snoozed.cta.show')}</p>
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
                  aria-label={tBoard(viewMode === 'archived' ? 'columns.archived.aria.hide' : 'columns.archived.aria.show', {
                    count: archivedCount,
                    name: column.name,
                  })}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{archivedCount}</span>
                </button>
                <div
                  className="pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg border border-amber-400/20 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t border-amber-400/20 bg-slate-900/95" />
                  <h4 className="mb-1 font-semibold text-amber-300">{tBoard('columns.archived.title')}</h4>
                  <p>{tBoard('columns.archived.body')}</p>
                  <p className="mt-1 text-[10px] italic text-slate-400">{tBoard(viewMode === 'archived' ? 'columns.archived.cta.hide' : 'columns.archived.cta.show')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {isEditing && editingValues && (
        <form onSubmit={(e)=> { e.preventDefault(); onSubmitEdit(); }} className="mt-4 space-y-3 rounded-xl border border-white/10 bg-surface/60 p-4">
          <HelpTooltip
            helpMode={helpMode}
            title={tBoard('help.columns.settings.name.title')}
            description={tBoard('help.columns.settings.name.body')}
            className="block"
          >
            <label className="text-xs text-muted">{tBoard('columns.form.name')}
              <input
                value={editingValues.name}
                onChange={e=>onFieldChange('name', e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </HelpTooltip>
          <HelpTooltip
            helpMode={helpMode}
            title={tBoard('help.columns.settings.wip.title')}
            description={tBoard('help.columns.settings.wip.body')}
            className="block"
          >
            <label className="text-xs text-muted">{tBoard('columns.form.wipLimit')}
              <input
                value={editingValues.wip}
                onChange={e=>onFieldChange('wip', e.target.value)}
                placeholder={tBoard('columns.form.wipPlaceholder')}
                className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>
          </HelpTooltip>
          {column.behaviorKey === 'BACKLOG' && (
            <HelpTooltip
              helpMode={helpMode}
              title={tBoard('help.columns.settings.backlogArchive.title')}
              description={tBoard('help.columns.settings.backlogArchive.body')}
              hint={tBoard('help.columns.settings.backlogArchive.hint')}
              className="block"
            >
              <label className="text-xs text-muted">{tBoard('columns.form.backlogArchive')}
                <input
                  value={editingValues.backlogArchiveAfter}
                  onChange={(e) => onFieldChange('backlogArchiveAfter', e.target.value)}
                  placeholder={tBoard('columns.form.backlogArchivePlaceholder')}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <p className="mt-1 text-[11px] text-slate-500">{tBoard('columns.form.backlogArchiveHint')}</p>
              </label>
            </HelpTooltip>
          )}
          {column.behaviorKey === 'DONE' && (
            <HelpTooltip
              helpMode={helpMode}
              title={tBoard('help.columns.settings.doneArchive.title')}
              description={tBoard('help.columns.settings.doneArchive.body')}
              hint={tBoard('help.columns.settings.doneArchive.hint')}
              className="block"
            >
              <label className="text-xs text-muted">{tBoard('columns.form.doneArchive')}
                <input
                  value={editingValues.doneArchiveAfter}
                  onChange={(e) => onFieldChange('doneArchiveAfter', e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </HelpTooltip>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={editingValues.submitting} className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">{tBoard('columns.form.save')}</button>
            <button type="button" onClick={onCancelEdit} className="text-xs text-muted hover:text-foreground">{tBoard('columns.form.cancel')}</button>
            <button type="button" onClick={onDelete} disabled={editingValues.submitting} className="ml-auto rounded-full border border-red-500/40 px-3 py-1 text-[11px] uppercase tracking-wide text-red-300 transition hover:border-red-200 disabled:opacity-60">{tBoard('columns.form.delete')}</button>
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
                  <p className="text-xs text-muted">{node.archivedAt
                    ? tBoard('columns.archived.list.archivedAt', { date: new Date(node.archivedAt).toLocaleString(locale) })
                    : tBoard('columns.archived.list.noArchivedAt')}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="min-h-[48px] rounded-xl border border-dashed border-white/10 bg-surface/40 px-4 py-4 text-sm text-muted">{tBoard('columns.archived.empty')}</p>
          )
        ) : cards.length === 0 ? (
          <p className={`min-h-[48px] rounded-xl border border-dashed ${isOver? 'border-accent/60 bg-accent/10':'border-white/10 bg-surface/40'} px-4 py-4 text-sm text-muted`}>
            {viewMode === 'snoozed' ? tBoard('columns.empty.snoozed') : tBoard('columns.empty.default')}
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
                helpMode={helpMode}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
