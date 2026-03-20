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

function getToneStyle(tone: 'info' | 'warning' | 'danger' | 'success' | 'accent'): React.CSSProperties {
  const variable =
    tone === 'info'
      ? 'var(--color-info)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'danger'
          ? 'var(--color-danger)'
          : tone === 'success'
            ? 'var(--color-success)'
            : 'var(--color-accent)';
  const soft =
    tone === 'info'
      ? 'var(--color-info-soft)'
      : tone === 'warning'
        ? 'var(--color-warning-soft)'
        : tone === 'danger'
          ? 'var(--color-danger-soft)'
          : tone === 'success'
            ? 'var(--color-success-soft)'
            : 'var(--color-accent-soft)';

  return {
    borderColor: `color-mix(in srgb, ${variable} 40%, var(--color-border) 60%)`,
    background: soft,
    color: variable,
  };
}

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
  onOpenCardView: (id: string) => void;
  onOpenCardEdit: (id: string) => void;
  onOpenChildBoard?: (boardId: string) => void; // navigation vers sous-board
  onRenameCard: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMoveCard: (node: BoardNode) => void;
  onRequestDeleteCard: (node: BoardNode) => void;
  onNavigateToDescendant?: (preview: {
    nodeId: string;
    title: string;
    boardId: string;
    parentId: string | null;
    depth: number;
  }) => void;
  childBoards: Record<string, NodeChildBoard>;
  highlightedNodeId?: string | null;
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
    onDelete, onCreateCard, onOpenCardView, onOpenCardEdit, onRenameCard,
    onRequestMoveCard, onRequestDeleteCard, onNavigateToDescendant,
    childBoards, highlightedNodeId, loadingCards, displayOptions, onOpenChildBoard,
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
      className={`app-section relative w-[320px] shrink-0 rounded-[1.45rem] p-5 shadow-lg ${isColumnDragging ? 'ring-2 ring-accent/40 ring-offset-2 ring-offset-background' : ''}`}
    >
      <div className={`absolute left-0 top-0 h-1 w-full rounded-t-2xl ${colorClass}`} />
      <header className="border-b pb-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold" title={column.name}>{column.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="group relative">
              <span
                className="app-badge flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-[11px] uppercase tracking-wide text-muted"
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
                  className="app-tooltip pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <p>{typeof column.wipLimit === 'number'
                    ? tBoard('columns.wip.helpLimited', { limit: column.wipLimit })
                    : tBoard('columns.wip.helpUnlimited')}</p>
                  <p className="mt-1 text-[10px] text-[color:var(--color-foreground-faint)]">{tBoard('columns.wip.helpHint')}</p>
                </div>
              )}
            </div>
            <div className="group relative">
              <button
                type="button"
                ref={handleRef}
                {...activatorAttributes}
                {...activatorListeners}
                className="app-icon-button flex h-8 w-8 cursor-grab items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing"
                aria-label={tBoard('columns.reorder.aria')}
              >
                <GripVertical className="h-4 w-4" aria-hidden="true" />
              </button>
              {helpMode && (
                <div
                  className="app-tooltip pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-52 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <p>{tBoard('columns.reorder.help')}</p>
                </div>
              )}
            </div>
            <div className="group relative">
              <button
                type="button"
                onClick={() => (isEditing ? onCancelEdit() : onRequestEdit(column.id))}
                className={`app-icon-button flex h-8 w-8 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${isEditing ? 'border-accent text-foreground' : ''}`}
                aria-label={isEditing ? tBoard('columns.settings.closeAria') : tBoard('columns.settings.openAria')}
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </button>
              {helpMode && (
                <div
                  className="app-tooltip pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-60 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                  role="tooltip"
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <p>{isEditing ? tBoard('columns.settings.helpClose') : tBoard('columns.settings.helpOpen')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <div className="group relative">
              <span className="app-badge flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 font-medium uppercase tracking-wide" role="status">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{behaviorLabel}</span>
              </span>
              {helpMode && (
                <div
                  className="app-tooltip pointer-events-none invisible absolute top-full left-0 z-[9999] mt-2 w-72 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                  style={{ transitionDelay: '150ms' }}
                >
                  <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <p className="font-semibold text-accent mb-1">{behaviorLabel}</p>
                  <p>{tBoard(`columns.behavior.${column.behaviorKey}`)}</p>
                </div>
              )}
            </div>
            {(column.behaviorKey === 'BACKLOG' || column.behaviorKey === 'DONE') && (
              <div className="group relative">
                <span className="app-badge flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 font-medium" role="status">
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {column.behaviorKey === 'BACKLOG' ? backlogArchiveBadge : doneArchiveBadge}
                  </span>
                </span>
                {helpMode && (
                  <div
                    className="app-tooltip pointer-events-none invisible absolute top-full left-0 z-[9999] mt-2 w-72 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
                    style={{ transitionDelay: '150ms' }}
                  >
                    <div className="absolute -top-1 left-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                    {column.behaviorKey === 'BACKLOG' ? (
                      <>
                        <p>{backlogArchiveTooltip}</p>
                        <p className="mt-1 text-[10px] text-[color:var(--color-foreground-faint)]">{tBoard('columns.archive.backlog.hint')}</p>
                      </>
                    ) : (
                      <>
                        <p>{tBoard('columns.archive.done.tooltip', { days: doneArchiveDelay })}</p>
                        <p className="mt-1 text-[10px] text-[color:var(--color-foreground-faint)]">{tBoard('columns.archive.done.hint')}</p>
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
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${viewMode === 'snoozed' ? '' : 'app-badge hover:text-foreground'}`}
                  style={viewMode === 'snoozed' ? getToneStyle('info') : undefined}
                  aria-label={tBoard(viewMode === 'snoozed' ? 'columns.snoozed.aria.hide' : 'columns.snoozed.aria.show', {
                    count: snoozedCount,
                    name: column.name,
                  })}
                >
                  <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{snoozedCount}</span>
                </button>
                <div
                  className="app-tooltip pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <h4 className="mb-1 font-semibold" style={{ color: 'var(--color-info)' }}>{tBoard('columns.snoozed.title')}</h4>
                  <p>{tBoard('columns.snoozed.body')}</p>
                  <p className="mt-1 text-[10px] italic text-[color:var(--color-foreground-faint)]">{tBoard(viewMode === 'snoozed' ? 'columns.snoozed.cta.hide' : 'columns.snoozed.cta.show')}</p>
                </div>
              </div>
            )}
            {(archivedCount > 0 || viewMode === 'archived') && (
              <div className="group relative">
                <button
                  type="button"
                  onClick={() => onShowArchived?.(column)}
                  disabled={!onShowArchived}
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 ${viewMode === 'archived' ? '' : 'app-badge hover:text-foreground'}`}
                  style={viewMode === 'archived' ? getToneStyle('warning') : undefined}
                  aria-label={tBoard(viewMode === 'archived' ? 'columns.archived.aria.hide' : 'columns.archived.aria.show', {
                    count: archivedCount,
                    name: column.name,
                  })}
                >
                  <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{archivedCount}</span>
                </button>
                <div
                  className="app-tooltip pointer-events-none invisible absolute top-full right-0 z-[9999] mt-2 w-64 rounded-lg p-3 text-xs shadow-2xl opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                  style={{ transitionDelay: '200ms' }}
                >
                  <div className="absolute -top-1 right-4 h-2 w-2 rotate-45 border-l border-t" style={{ borderColor: 'var(--color-border-subtle)', background: 'color-mix(in srgb, var(--color-background) 84%, var(--color-surface) 16%)' }} />
                  <h4 className="mb-1 font-semibold" style={{ color: 'var(--color-warning)' }}>{tBoard('columns.archived.title')}</h4>
                  <p>{tBoard('columns.archived.body')}</p>
                  <p className="mt-1 text-[10px] italic text-[color:var(--color-foreground-faint)]">{tBoard(viewMode === 'archived' ? 'columns.archived.cta.hide' : 'columns.archived.cta.show')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {isEditing && editingValues && (
        <form onSubmit={(e)=> { e.preventDefault(); onSubmitEdit(); }} className="app-toolbar mt-4 space-y-3 rounded-xl p-4">
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
                className="app-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
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
                className="app-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
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
                  className="app-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-[color:var(--color-foreground-faint)]">{tBoard('columns.form.backlogArchiveHint')}</p>
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
                  className="app-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </HelpTooltip>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={editingValues.submitting} className="rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-60" style={{ background: 'var(--color-accent)', color: 'var(--color-accent-foreground)' }}>{tBoard('columns.form.save')}</button>
            <button type="button" onClick={onCancelEdit} className="text-xs text-muted hover:text-foreground">{tBoard('columns.form.cancel')}</button>
            <button type="button" onClick={onDelete} disabled={editingValues.submitting} className="app-danger-panel ml-auto rounded-full px-3 py-1 text-[11px] uppercase tracking-wide transition disabled:opacity-60" style={{ color: 'var(--color-danger)' }}>{tBoard('columns.form.delete')}</button>
          </div>
          {editingValues.error && <p className="text-xs" style={{ color: 'var(--color-danger)' }}>{editingValues.error}</p>}
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
                  className="app-toolbar w-full rounded-xl p-3 text-left transition hover:border-accent/40 hover:bg-surface"
                >
                  <p className="text-sm font-semibold">{node.shortId ? `#${node.shortId} ` : ''}{node.title}</p>
                  <p className="text-xs text-muted">{node.archivedAt
                    ? tBoard('columns.archived.list.archivedAt', { date: new Date(node.archivedAt).toLocaleString(locale) })
                    : tBoard('columns.archived.list.noArchivedAt')}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="app-toolbar min-h-[48px] rounded-xl border-dashed px-4 py-4 text-sm text-muted">{tBoard('columns.archived.empty')}</p>
          )
        ) : cards.length === 0 ? (
          <p className={`min-h-[48px] rounded-xl border border-dashed px-4 py-4 text-sm text-muted ${isOver ? '' : 'app-toolbar'}`} style={isOver ? { borderColor: 'color-mix(in srgb, var(--color-accent) 60%, var(--color-border) 40%)', background: 'var(--color-accent-soft)' } : undefined}>
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
                onOpenView={onOpenCardView}
                onOpenEdit={onOpenCardEdit}
                onOpenChildBoard={onOpenChildBoard}
                onRename={onRenameCard}
                onRequestMove={onRequestMoveCard}
                onRequestDelete={onRequestDeleteCard}
                onNavigateToDescendant={onNavigateToDescendant}
                highlighted={highlightedNodeId === card.id}
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
