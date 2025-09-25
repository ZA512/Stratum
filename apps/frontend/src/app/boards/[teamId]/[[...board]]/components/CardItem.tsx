"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardNode } from '@/features/boards/boards-api';

interface CardItemProps {
  node: BoardNode;
  columnId: string;
  childBoard?: { boardId: string } | undefined;
  onOpen: (id: string) => void;
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
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

export function CardItem({ node, columnId, childBoard, onOpen, onRename, showDescription }: CardItemProps){
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: node.id, data:{ columnId, type:'card', node: { id: node.id, title: node.title } }});
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.4:1 };

  const [editing,setEditing] = useState(false);
  const [title,setTitle] = useState(node.title);
  const [counts, setCounts] = useState<{backlog:number; inProgress:number; blocked:number; done:number} | null>(node.counts ?? null);
  const [effort, setEffort] = useState<null | 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL'>(node.effort ?? null);

  useEffect(()=>{ setTitle(node.title); },[node.id,node.title]);

  const save = async () => {
    if(!editing) return;
    const t = title.trim();
    if(!t){ setTitle(node.title); setEditing(false); return; }
    if(t === node.title){ setEditing(false); return; }
    try {
      await onRename?.(node.id, t);
    } finally {
      setEditing(false);
    }
  };

  useEffect(()=>{
    setCounts(node.counts ?? null);
    setEffort(node.effort ?? null);
  }, [node.id, node.counts, node.effort]);

  const descriptionExcerpt = useMemo(() => {
    if (!showDescription) return '';
    return truncateDescription(node.description);
  }, [node.description, showDescription]);

  const assignees = node.assignees ?? [];
  const primaryAssignee = assignees.length > 0 ? assignees[0] : null;
  const assigneeInitials = useMemo(() => {
    if (!primaryAssignee) return '';
    return getInitials(primaryAssignee.displayName);
  }, [primaryAssignee?.displayName]);

  const dueInfo = useMemo(() => {
    if (!node.dueAt) return null;
    const dueDate = new Date(node.dueAt);
    if (Number.isNaN(dueDate.getTime())) return null;
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const diffDays = Math.round((startDue.getTime() - startToday.getTime()) / DAY_IN_MS);
    const estimate = typeof node.estimatedDurationDays === 'number' && Number.isFinite(node.estimatedDurationDays) && node.estimatedDurationDays > 0
      ? node.estimatedDurationDays
      : null;
    const redThreshold = estimate ?? 2;
    const orangeThreshold = estimate ? estimate * 2 : 7;
    const palette = diffDays <= 0 || diffDays <= redThreshold
      ? 'red'
      : diffDays <= orangeThreshold
        ? 'orange'
        : 'green';
    const label = diffDays > 0 ? `-${diffDays}` : diffDays < 0 ? `+${Math.abs(diffDays)}` : '0';
    const tooltipDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(dueDate);
    const tooltip = estimate ? `${tooltipDate} • estimation ${estimate}j` : tooltipDate;
    const aria = diffDays > 0
      ? `Échéance dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`
      : diffDays < 0
        ? `Échéance dépassée de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`
        : `Échéance aujourd'hui`;
    const classes = palette === 'green'
      ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
      : palette === 'orange'
        ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
        : 'border-rose-500/40 bg-rose-500/15 text-rose-200';
    return { label, tooltip, aria, classes };
  }, [node.dueAt, node.estimatedDurationDays]);

  const shortIdLabel = typeof node.shortId === 'number' && Number.isFinite(node.shortId) && node.shortId > 0 ? `#${node.shortId}` : '';

  const priorityColor = node.priority === 'CRITICAL' ? 'bg-red-600' :
    node.priority === 'HIGH' ? 'bg-rose-500' :
    node.priority === 'MEDIUM' ? 'bg-amber-500' :
    node.priority === 'LOW' ? 'bg-emerald-500' :
    node.priority === 'LOWEST' ? 'bg-slate-500' : 'bg-slate-600';

  const overdue = useMemo(()=>{
    if(!node.blockedExpectedUnblockAt) return false;
    const d = new Date(node.blockedExpectedUnblockAt).getTime();
    if(Number.isNaN(d)) return false;
    return d < Date.now();
  }, [node.blockedExpectedUnblockAt]);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="rounded-xl border border-white/10 bg-surface/80 p-4 transition hover:border-accent/60 cursor-default relative" onDoubleClick={()=> onOpen(node.id)}>
      {shortIdLabel && (
        <span className="absolute left-3 top-3 text-[11px] font-mono uppercase tracking-wide text-muted">{shortIdLabel}</span>
      )}
      {( (node.priority && node.priority !== 'NONE') || effort) && (
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
          {node.priority && node.priority !== 'NONE' && (
            <span
              className={`inline-flex h-3 w-3 rounded-sm border border-white/20 ${priorityColor}`}
              title={`Priorité: ${node.priority}`}
              aria-label={`Priorité ${node.priority}`}
            />
          )}
          {effort && (
            <span
              className={
                'inline-flex h-3 w-3 rounded-sm border border-white/20 ' +
                (effort === 'UNDER2MIN' ? 'bg-emerald-400' :
                 effort === 'XS' ? 'bg-sky-400' :
                 effort === 'S' ? 'bg-blue-400' :
                 effort === 'M' ? 'bg-amber-400' :
                 effort === 'L' ? 'bg-orange-500' :
                 effort === 'XL' ? 'bg-rose-500' :
                 'bg-red-600')
              }
              title={`Effort: ${effort}`}
              aria-label={`Effort ${effort}`}
            />
          )}
          {overdue && (
            <span
              className="inline-flex h-3 w-3 rounded-sm border border-white/20 bg-red-600 animate-pulse"
              title="Blocage en retard (date prévue dépassée)"
              aria-label="Blocage en retard"
            />
          )}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="w-full min-w-0">
            {!editing && (
              <p className="text-sm font-medium leading-tight break-words pr-6">{title}</p>
            )}
            {editing && (
              <input
                value={title}
                onChange={e=>setTitle(e.target.value)}
                onBlur={save}
                onKeyDown={e=>{ if(e.key==='Enter'){save();} if(e.key==='Escape'){ setTitle(node.title); setEditing(false);} }}
                className="w-full rounded border border-white/20 bg-surface px-2 py-1 text-xs focus:outline-none focus:ring focus:ring-accent/40"
                autoFocus
              />
            )}
          </div>
        </div>
        {!editing && descriptionExcerpt && (
          <p className="text-xs leading-snug text-muted">{descriptionExcerpt}</p>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {primaryAssignee ? (
            <span
              className="relative inline-flex h-8 w-8 overflow-hidden rounded-full border border-white/15 bg-white/10 text-xs font-semibold uppercase text-foreground"
              title={`Assigné à ${primaryAssignee.displayName}`}
              aria-label={`Assigné à ${primaryAssignee.displayName}`}
            >
              {primaryAssignee.avatarUrl ? (
                <img src={primaryAssignee.avatarUrl} alt={primaryAssignee.displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center">{assigneeInitials || '??'}</span>
              )}
            </span>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-white/20 text-[10px] uppercase text-muted" aria-label="Aucun assigné">
              --
            </span>
          )}
          {dueInfo && (
            <span
              className={`inline-flex min-w-[2.75rem] justify-center rounded-full border px-2 py-1 text-[11px] font-semibold ${dueInfo.classes}`}
              title={dueInfo.tooltip}
              aria-label={dueInfo.aria}
            >
              {dueInfo.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {childBoard && (
            <button
              type="button"
              onClick={()=> onOpen(childBoard.boardId)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/15 text-xs text-accent transition hover:border-accent hover:text-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/40"
              title="Ouvrir le sous-board"
              aria-label="Ouvrir le sous-board"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3 3h6v6H3V3zm0 12h6v6H3v-6zm12-12h6v6h-6V3zm0 12h6v6h-6v-6z"/>
              </svg>
            </button>
          )}
          {counts && (
            <div
              className="flex items-center gap-0.5 text-[10px] font-mono"
              title={`Sous-tâches: Backlog ${counts.backlog} • En cours ${counts.inProgress} • Bloqué ${counts.blocked} • Fait ${counts.done}`}
              aria-label={`Sous-tâches: Backlog ${counts.backlog}, En cours ${counts.inProgress}, Bloqué ${counts.blocked}, Fait ${counts.done}`}
            >
              <span className="sr-only">Ordre: Backlog, En cours, Bloqué, Fait</span>
              <span className="text-amber-400">{counts.backlog}</span>
              <span className="text-muted">.</span>
              <span className="text-sky-400">{counts.inProgress}</span>
              <span className="text-muted">.</span>
              <span className="text-red-400">{counts.blocked}</span>
              <span className="text-muted">.</span>
              <span className="text-emerald-400">{counts.done}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
