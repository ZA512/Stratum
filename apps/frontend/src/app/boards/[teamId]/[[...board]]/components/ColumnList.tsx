"use client";
import React from 'react';
import type { BoardColumnWithNodes } from './types';
import type { NodeChildBoard, BoardNode } from '@/features/boards/boards-api';
import { ColumnPanel } from './ColumnPanel';

interface ColumnListProps {
  columns: BoardColumnWithNodes[];
  childBoards: Record<string, NodeChildBoard>;
  editingColumnId: string | null;
  editingValues: { name: string; wip: string; submitting: boolean; error: string|null } | null;
  loadingCards: boolean;
  showDescriptions: boolean;
  onRequestEdit: (id:string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onFieldChange: (field: 'name'|'wip', value: string) => void;
  onMoveColumn: (columnId:string, direction:-1|1) => void;
  onDeleteColumn: (columnId:string) => void;
  onCreateCard: (columnId:string, title:string) => Promise<void> | void;
  onOpenCard: (id: string) => void;
  onOpenChildBoard?: (boardId: string) => void;
  onRenameCard: (id:string, newTitle:string) => Promise<void> | void;
  onRequestMoveCard: (node: BoardNode) => void;
  onRequestDeleteCard: (node: BoardNode) => void;
}

export function ColumnList(props: ColumnListProps){
  const { columns, childBoards, editingColumnId, editingValues, loadingCards } = props;
  // Largeur approximative d'une colonne (panel) + gap
  const ESTIMATED_COLUMN_WIDTH = 320; // px (panel max)
  const GAP = 16; // gap-4
  const totalWidth = columns.length * ESTIMATED_COLUMN_WIDTH + Math.max(0, columns.length - 1) * GAP;

  return (
    <div
      className="relative pb-2"
    >
      <div
        style={{
          display: 'flex',
            gap: GAP,
            overflowX: 'auto',
            paddingBottom: '4px',
            // Si le total tient dans la fenêtre (moins une marge sécurité), on centre.
            justifyContent: (typeof window !== 'undefined' && totalWidth <= window.innerWidth - 160) ? 'center' : 'flex-start'
        }}
      >
      {columns.map((column, index) => {
        const isEditing = editingColumnId === column.id;
        const cards = column.nodes || [];
        return (
          <ColumnPanel
            key={column.id}
            column={column}
            cards={cards}
            isEditing={isEditing}
            isFirst={index === 0}
            isLast={index === columns.length - 1}
            editingValues={isEditing ? editingValues : null}
            onRequestEdit={props.onRequestEdit}
            onCancelEdit={props.onCancelEdit}
            onSubmitEdit={props.onSubmitEdit}
            onFieldChange={props.onFieldChange}
            onMove={(dir)=> props.onMoveColumn(column.id, dir)}
            onDelete={()=> props.onDeleteColumn(column.id)}
            onCreateCard={(title)=> props.onCreateCard(column.id, title)}
            onOpenCard={props.onOpenCard}
            onOpenChildBoard={props.onOpenChildBoard}
            onRenameCard={props.onRenameCard}
            onRequestMoveCard={props.onRequestMoveCard}
            onRequestDeleteCard={props.onRequestDeleteCard}
            showDescription={props.showDescriptions}
            childBoards={childBoards}
            loadingCards={loadingCards}
          />
        );
      })}
      </div>
    </div>
  );
}
