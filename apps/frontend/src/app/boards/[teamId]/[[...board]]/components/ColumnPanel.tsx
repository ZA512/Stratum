"use client";
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { BoardColumnWithNodes } from './types';
import { BEHAVIOR_COLOR_CLASSES, BEHAVIOR_LABELS } from './constants';
import { AddCardForm } from './AddCardForm';
import { BoardTaskCard } from './BoardTaskCard';
import type { BoardNode, NodeChildBoard } from '@/features/boards/boards-api';

interface ColumnPanelProps {
  column: BoardColumnWithNodes;
  cards: BoardNode[];
  isEditing: boolean;
  isFirst: boolean;
  isLast: boolean;
  editingValues: { name: string; wip: string; submitting: boolean; error: string|null } | null;
  onRequestEdit: (columnId: string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void; // actual payload handled upstream
  onFieldChange: (field: 'name' | 'wip', value: string) => void;
  onMove: (direction: -1|1) => void;
  onDelete: () => void;
  onCreateCard: (title: string) => Promise<void> | void;
  onOpenCard: (id: string) => void;
  onOpenChildBoard?: (boardId: string) => void;
  onRenameCard: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMoveCard: (node: BoardNode) => void;
  onRequestDeleteCard: (node: BoardNode) => void;
  childBoards: Record<string, NodeChildBoard>;
  loadingCards: boolean;
  showDescription: boolean;
}

export function ColumnPanel(props: ColumnPanelProps){
  const {
    column, cards, isEditing, isFirst, isLast, editingValues,
    onRequestEdit, onCancelEdit, onSubmitEdit, onFieldChange,
    onMove, onDelete, onCreateCard, onOpenCard, onRenameCard,
    onRequestMoveCard, onRequestDeleteCard,
    childBoards, loadingCards, showDescription, onOpenChildBoard
  } = props;

  const colorClass = BEHAVIOR_COLOR_CLASSES[column.behaviorKey] || '';
  // Zone de drop par colonne (utile quand aucune carte)
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id, data: { type: 'column' } });

  return (
    <div className={`min-w-[280px] max-w-[320px] shrink-0 rounded-2xl border border-white/10 bg-card/80 p-5 shadow-lg relative`}>
      <div className={`absolute left-0 top-0 h-1 w-full rounded-t-2xl ${colorClass}`} />
      <header className="flex items-start justify-between gap-3 pb-2 border-b border-white/10">
        <div>
          <h3 className="text-lg font-semibold">{column.name}</h3>
          <p className="text-[11px] uppercase tracking-wide text-muted">{BEHAVIOR_LABELS[column.behaviorKey as keyof typeof BEHAVIOR_LABELS] || column.behaviorKey}</p>
        </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={editingValues.submitting} className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">Enregistrer</button>
            <button type="button" onClick={onCancelEdit} className="text-xs text-muted hover:text-foreground">Annuler</button>
            <button type="button" onClick={()=>onMove(-1)} disabled={editingValues.submitting||isFirst} className="ml-auto rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60">Gauche</button>
            <button type="button" onClick={()=>onMove(1)} disabled={editingValues.submitting||isLast} className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60">Droite</button>
            <button type="button" onClick={onDelete} disabled={editingValues.submitting} className="rounded-full border border-red-500/40 px-3 py-1 text-[11px] uppercase tracking-wide text-red-300 transition hover:border-red-200 disabled:opacity-60">Supprimer</button>
          </div>
          {editingValues.error && <p className="text-xs text-red-300">{editingValues.error}</p>}
        </form>
      )}
  <div className={`mt-4 rounded-xl transition ${isOver? 'ring-2 ring-accent/50 ring-offset-2 ring-offset-background':''}`} ref={setDropRef}>
        {cards.length === 0 ? (
          <p className={`min-h-[48px] rounded-xl border border-dashed ${isOver? 'border-accent/60 bg-accent/10':'border-white/10 bg-surface/40'} px-4 py-4 text-sm text-muted`}>Aucune carte</p>
        ) : (
          <div className="space-y-3">
            {cards.map(card => (
              <BoardTaskCard
                key={card.id}
                node={card}
                columnId={column.id}
                childBoard={childBoards[card.id]}
                onOpen={onOpenCard}
                onOpenChildBoard={onOpenChildBoard}
                onRename={onRenameCard}
                onRequestMove={onRequestMoveCard}
                onRequestDelete={onRequestDeleteCard}
                showDescription={showDescription}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 border-t border-white/10 pt-4">
        <AddCardForm onCreate={onCreateCard} disabled={loadingCards} />
      </div>
    </div>
  );
}
