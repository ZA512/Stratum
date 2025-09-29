"use client";
import React, { useMemo } from 'react';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardColumnWithNodes, CardDisplayOptions } from './types';
import type { NodeChildBoard, BoardNode } from '@/features/boards/boards-api';
import { ColumnPanel } from './ColumnPanel';

interface ColumnListProps {
  columns: BoardColumnWithNodes[];
  childBoards: Record<string, NodeChildBoard>;
  editingColumnId: string | null;
  editingValues: { name: string; wip: string; submitting: boolean; error: string|null } | null;
  loadingCards: boolean;
  displayOptions: CardDisplayOptions;
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

type ColumnListItemProps = {
  column: BoardColumnWithNodes;
  index: number;
  total: number;
  childBoards: Record<string, NodeChildBoard>;
  editingColumnId: string | null;
  editingValues: { name: string; wip: string; submitting: boolean; error: string|null } | null;
  loadingCards: boolean;
  displayOptions: CardDisplayOptions;
  onRequestEdit: (id: string) => void;
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
};

const ColumnListItem: React.FC<ColumnListItemProps> = ({
  column,
  index,
  total,
  childBoards,
  editingColumnId,
  editingValues,
  loadingCards,
  displayOptions,
  onRequestEdit,
  onCancelEdit,
  onSubmitEdit,
  onFieldChange,
  onMoveColumn,
  onDeleteColumn,
  onCreateCard,
  onOpenCard,
  onOpenChildBoard,
  onRenameCard,
  onRequestMoveCard,
  onRequestDeleteCard,
}) => {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'board-column', columnId: column.id },
  });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const isEditing = editingColumnId === column.id;
  const cards = column.nodes || [];

  return (
    <ColumnPanel
      ref={setNodeRef}
      column={column}
      cards={cards}
      isEditing={isEditing}
      isFirst={index === 0}
      isLast={index === total - 1}
      editingValues={isEditing ? editingValues : null}
      onRequestEdit={onRequestEdit}
      onCancelEdit={onCancelEdit}
      onSubmitEdit={onSubmitEdit}
      onFieldChange={onFieldChange}
      onMove={(dir)=> onMoveColumn(column.id, dir)}
      onDelete={()=> onDeleteColumn(column.id)}
      onCreateCard={(title)=> onCreateCard(column.id, title)}
      onOpenCard={onOpenCard}
      onOpenChildBoard={onOpenChildBoard}
      onRenameCard={onRenameCard}
      onRequestMoveCard={onRequestMoveCard}
      onRequestDeleteCard={onRequestDeleteCard}
      childBoards={childBoards}
      loadingCards={loadingCards}
      displayOptions={displayOptions}
      dragStyle={dragStyle}
      dragHandleAttributes={attributes}
      dragHandleListeners={listeners}
      dragHandleRef={setActivatorNodeRef}
      isColumnDragging={isDragging}
    />
  );
};

export function ColumnList(props: ColumnListProps){
  const { columns, childBoards, editingColumnId, editingValues, loadingCards, displayOptions } = props;
  // Largeur approximative d'une colonne (panel) + gap
  const ESTIMATED_COLUMN_WIDTH = 320; // px (panel max)
  const GAP = 16; // gap-4
  const totalWidth = useMemo(() => columns.length * ESTIMATED_COLUMN_WIDTH + Math.max(0, columns.length - 1) * GAP, [columns.length]);

  return (
    <div
      className="relative pb-2"
    >
      <SortableContext items={columns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
        <div
          style={{
            display: 'flex',
            gap: GAP,
            overflowX: 'auto',
            paddingBottom: '4px',
            justifyContent: (typeof window !== 'undefined' && totalWidth <= window.innerWidth - 160) ? 'center' : 'flex-start',
          }}
        >
          {columns.map((column, index) => (
            <ColumnListItem
              key={column.id}
              column={column}
              index={index}
              total={columns.length}
              childBoards={childBoards}
              editingColumnId={editingColumnId}
              editingValues={editingValues}
              loadingCards={loadingCards}
              displayOptions={displayOptions}
              onRequestEdit={props.onRequestEdit}
              onCancelEdit={props.onCancelEdit}
              onSubmitEdit={props.onSubmitEdit}
              onFieldChange={props.onFieldChange}
              onMoveColumn={props.onMoveColumn}
              onDeleteColumn={props.onDeleteColumn}
              onCreateCard={props.onCreateCard}
              onOpenCard={props.onOpenCard}
              onOpenChildBoard={props.onOpenChildBoard}
              onRenameCard={props.onRenameCard}
              onRequestMoveCard={props.onRequestMoveCard}
              onRequestDeleteCard={props.onRequestDeleteCard}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
