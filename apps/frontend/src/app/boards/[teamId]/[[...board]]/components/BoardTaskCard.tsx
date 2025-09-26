"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskCard, { TaskCardProps, TaskAssignee } from '@/components/task/task-card';
import type { BoardNode } from '@/features/boards/boards-api';

interface BoardTaskCardProps {
  node: BoardNode;
  columnId: string;
  childBoard?: { boardId: string } | undefined;
  onOpen: (id: string) => void;
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
  onRequestMove: (node: BoardNode) => void;
  onRequestDelete: (node: BoardNode) => void;
  showDescription: boolean;
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

export function BoardTaskCard({ node, columnId, childBoard, onOpen, onRename, onRequestMove, onRequestDelete, showDescription }: BoardTaskCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ 
    id: node.id, 
    data: { columnId, type: 'card', node: { id: node.id, title: node.title } }
  });
  
  const style: React.CSSProperties = { 
    transform: CSS.Transform.toString(transform), 
    transition, 
    opacity: isDragging ? 0.4 : 1 
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const assignees: TaskAssignee[] = (node.assignees ?? []).map(a => ({
    id: a.id,
    initials: getInitials(a.displayName),
  }));

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

  const description = showDescription ? truncateDescription(node.description) : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard
        id={shortIdLabel}
        priority={priority}
        title={editing ? '' : title}
        description={description}
        assignees={assignees}
        lateness={lateness}
        complexity={complexity}
        fractalPath={fractalPath}
        onClick={() => onOpen(node.id)}
        className="cursor-grab active:cursor-grabbing"
      />
      
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
      
      {/* Bouton menu customisé (remplace celui du TaskCard) */}
      <div className="absolute right-3 top-3">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(prev => !prev);
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 transition"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Actions carte"
        >
          <span className="material-icons-outlined" style={{ fontSize: 18 }}>more_horiz</span>
        </button>
      </div>
    </div>
  );
}