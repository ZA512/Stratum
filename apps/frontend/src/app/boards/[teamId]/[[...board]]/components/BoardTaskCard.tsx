"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard, { TaskCardProps, TaskAssignee } from '@/components/task/task-card';
import { useAuth } from '@/features/auth/auth-provider';
import { ensureChildBoard } from '@/features/boards/boards-api';
import type { BoardNode } from '@/features/boards/boards-api';
import type { CardDisplayOptions } from './types';

interface BoardTaskCardProps {
  node: BoardNode;
  columnId: string;
  childBoard?: { boardId: string } | undefined;
  onOpen: (id: string) => void;              // ouvre le drawer tâche
  onOpenChildBoard?: (boardId: string) => void; // navigation vers sous-board
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMove: (node: BoardNode) => void;
  onRequestDelete: (node: BoardNode) => void;
  displayOptions: CardDisplayOptions;
}

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function getInitials(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) ?? '' : parts[0]?.charAt(1) ?? '';
  return (first + last).toUpperCase();
}

function truncateDescription(description: string | null | undefined, maxLength = 110): string {
  if (!description) return '';
  const trimmed = description.trim();
  if (!trimmed) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

export function BoardTaskCard({ node, columnId, childBoard, onOpen, onOpenChildBoard, onRename, onRequestMove, onRequestDelete, displayOptions }: BoardTaskCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ 
    id: node.id, 
    data: { columnId, type: 'card', node: { id: node.id, title: node.title } }
  });
  const { accessToken } = useAuth();
  
  const style: React.CSSProperties = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    opacity: isDragging ? 0.4 : 1 
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fractalLoading, setFractalLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setTitle(node.title); }, [node.id, node.title]);

  const save = async () => {
    if (!editing) return;
    const t = title.trim();
    if (!t) { setTitle(node.title); setEditing(false); return; }
    if (t === node.title) { setEditing(false); return; }
    try {
      await onRename?.(node.id, t);
    } finally {
      setEditing(false);
    }
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (menuButtonRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen, closeMenu]);

  // Mapping vers TaskCard props
  const priority: TaskCardProps['priority'] = 
    node.priority === 'CRITICAL' ? 'Critical' :
    node.priority === 'HIGH' ? 'High' :
    node.priority === 'MEDIUM' ? 'Medium' :
    'Low';

  const responsibleMembers = node.raci?.responsible ?? node.assignees ?? [];
  const assignees: TaskAssignee[] = responsibleMembers.map(a => ({
    id: a.id,
    initials: getInitials(a.displayName),
    displayName: a.displayName,
  }));

  const raciTooltip = useMemo(() => {
    // Toujours 4 lignes (R, A, C, I). Format demandé: 'R nom prénom, nom prénom' (sans deux-points) ou 'R -' si vide.
    const buildLine = (label: string, list: { displayName: string }[] | undefined) => {
      const names = (list || [])
        .map(e => e.displayName)
        .filter(Boolean)
        .sort((a,b)=> a.localeCompare(b,'fr',{sensitivity:'base'}));
      return names.length ? `${label} ${names.join(', ')}` : `${label} -`;
    };
    let result: string;
    if (!node.raci) {
      // Fallback: tout le monde en R, autres vides
      const rNames = (node.assignees||[]).map(a=>a.displayName).filter(Boolean).sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
      const rLine = rNames.length ? `R ${rNames.join(', ')}` : 'R -';
      result = [rLine, 'A -', 'C -', 'I -'].join('\n');
    } else {
      result = [
        buildLine('R', node.raci.responsible),
        buildLine('A', node.raci.accountable),
        buildLine('C', node.raci.consulted),
        buildLine('I', node.raci.informed),
      ].join('\n');
    }
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug('[RACI tooltip]', { nodeId: node.id, hasRaci: !!node.raci, assigneesCount: node.assignees?.length || 0, tooltip: result, showOwner: displayOptions.showOwner });
    }
    return result;
  }, [node.raci, node.assignees, displayOptions.showOwner]);

  const lateness = useMemo(() => {
    if (!node.dueAt) return undefined;
    const dueDate = new Date(node.dueAt);
    if (Number.isNaN(dueDate.getTime())) return undefined;
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    return Math.round((startDue.getTime() - startToday.getTime()) / DAY_IN_MS);
  }, [node.dueAt]);

  const complexity = node.effort === 'UNDER2MIN' ? 'XS' :
    node.effort === 'XS' ? 'XS' :
    node.effort === 'S' ? 'S' :
    node.effort === 'M' ? 'M' :
    node.effort === 'L' ? 'L' :
    node.effort === 'XL' ? 'XL' :
    node.effort === 'XXL' ? 'XXL' :
    undefined;

  const fractalPath = node.counts ? 
    `${node.counts.backlog}.${node.counts.inProgress}.${node.counts.blocked}.${node.counts.done}` :
    undefined;

  const shortIdLabel = typeof node.shortId === 'number' && Number.isFinite(node.shortId) && node.shortId > 0 ? 
    node.shortId : node.id;

  const description = displayOptions.showDescription ? truncateDescription(node.description) : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        id={shortIdLabel}
        priority={priority}
        title={editing ? '' : title}
        description={description}
        assignees={assignees}
        assigneeTooltip={raciTooltip}
        lateness={lateness}
        complexity={complexity}
        fractalPath={fractalPath}
        progress={typeof node.progress === 'number' ? node.progress : undefined}
        showId={displayOptions.showShortId}
        showPriority={displayOptions.showPriority}
        showAssignees={displayOptions.showOwner}
        showDueDate={displayOptions.showDueDate}
        showProgress={displayOptions.showProgress}
        showEffort={displayOptions.showEffort}
        onClick={() => onOpen(node.id)}
        onFractalPathClick={async () => {
          if (!onOpenChildBoard || fractalLoading) return;
            // Si déjà présent
          if (childBoard) {
            onOpenChildBoard(childBoard.boardId);
            return;
          }
          if (!accessToken) return;
          try {
            setFractalLoading(true);
            const boardId = await ensureChildBoard(node.id, accessToken);
            onOpenChildBoard(boardId);
          } catch {
            // TODO: brancher un toast d'erreur si disponible
          } finally {
            setFractalLoading(false);
          }
        }}
        onMenuButtonClick={() => setMenuOpen(prev => !prev)}
        className="cursor-grab active:cursor-grabbing"
      />
      {fractalLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 z-40">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        </div>
      )}
      
      {/* Menu contextuel overlay */}
      {menuOpen && (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-2 top-12 min-w-[180px] rounded-xl border border-white/10 bg-surface/95 p-2 text-sm shadow-xl backdrop-blur z-50"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onOpen(node.id);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            ✏️ <span>Éditer la tâche</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              setEditing(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            📝 <span>Modifier le titre</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onRequestMove(node);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10 focus:bg-white/10"
          >
            📦 <span>Déplacer dans un autre kanban</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              onRequestDelete(node);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-300 transition hover:bg-rose-500/20 focus:bg-rose-500/20"
          >
            🗑️ <span>Supprimer…</span>
          </button>
        </div>
      )}
      
      {/* Mode édition overlay */}
      {editing && (
        <div className="absolute inset-4 flex items-start">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={e => { 
              if (e.key === 'Enter') { save(); } 
              if (e.key === 'Escape') { setTitle(node.title); setEditing(false); } 
            }}
            className="w-full rounded border border-blue-500 bg-white dark:bg-gray-800 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-blue-500/40"
            autoFocus
          />
        </div>
      )}
      
      {/* Bouton menu customisé retiré : on utilise celui du TaskCard via delegation */}
    </div>
  );
}