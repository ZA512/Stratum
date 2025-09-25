"use client";
import React from 'react';
import type { BoardColumnWithNodes } from './types';
import type { NodeChildBoard } from '@/features/boards/boards-api';
import { ColumnPanel } from './ColumnPanel';

interface ColumnListProps {
  columns: BoardColumnWithNodes[];
  childBoards: Record<string, NodeChildBoard>;
  editingColumnId: string | null;
  editingValues: { name: string; wip: string; submitting: boolean; error: string|null } | null;
  loadingCards: boolean;
  onRequestEdit: (id:string) => void;
  onCancelEdit: () => void;
  onSubmitEdit: () => void;
  onFieldChange: (field: 'name'|'wip', value: string) => void;
  onMoveColumn: (columnId:string, direction:-1|1) => void;
  onDeleteColumn: (columnId:string) => void;
  onCreateCard: (columnId:string, title:string) => Promise<void> | void;
  onOpenCard: (id: string) => void;
  onRenameCard: (id:string, newTitle:string) => Promise<void> | void;
}

export function ColumnList(props: ColumnListProps){
  const { columns, childBoards, editingColumnId, editingValues, loadingCards } = props;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
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
            onRenameCard={props.onRenameCard}
            childBoards={childBoards}
            loadingCards={loadingCards}
          />
        );
      })}
    </div>
  );
}
