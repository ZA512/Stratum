"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoardNode } from '@/features/boards/boards-api';
import { useAuth } from '@/features/auth/auth-provider';

interface CardItemProps {
  node: BoardNode;
  columnId: string;
  childBoard?: { boardId: string } | undefined;
  onOpen: (id: string) => void;
  onRename?: (id: string, newTitle: string) => Promise<void> | void;
}

export function CardItem({ node, columnId, childBoard, onOpen, onRename }: CardItemProps){
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: node.id, data:{ columnId, type:'card', node: { id: node.id, title: node.title } }});
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging?0.4:1 };

  const [editing,setEditing] = useState(false);
  const [title,setTitle] = useState(node.title);
  const [saving,setSaving] = useState(false);
  const { accessToken } = useAuth();
  const [counts, setCounts] = useState<{backlog:number; inProgress:number; blocked:number; done:number} | null>(node.counts ?? null);
  const [effort, setEffort] = useState<null | 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL'>(node.effort ?? null);

  useEffect(()=>{ setTitle(node.title); },[node.id,node.title]);

  const save = async () => {
    if(!editing) return;
    const t = title.trim();
    if(!t){ setTitle(node.title); setEditing(false); return; }
    if(t === node.title){ setEditing(false); return; }
    try {
      setSaving(true);
      await onRename?.(node.id, t);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  // Synchroniser lorsque le board se rafraichit et fournit de nouvelles données
  useEffect(()=>{
    setCounts(node.counts ?? null);
    setEffort(node.effort ?? null);
  }, [node.id, node.counts, node.effort]);

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
      {/* Pile badges priorité + effort */}
      {( (node.priority && node.priority !== 'NONE') || effort) && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end z-10">
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
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 w-full min-w-0">
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
          {node.dueAt && <p className="text-xs text-muted">Due {new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(new Date(node.dueAt))}</p>}
        </div>
      </div>
      {childBoard && (
        <button type="button" onClick={()=> childBoard && onOpen(childBoard.boardId)} className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-accent transition hover:text-accent-strong" title="Ouvrir le sous-board">
          {/* Icône grille 3x3 */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M3 3h6v6H3V3zm0 12h6v6H3v-6zm12-12h6v6h-6V3zm0 12h6v6h-6v-6z"/>
          </svg>
        </button>
      )}
      {counts && (
        <div className="absolute bottom-2 right-2 text-[10px] font-mono flex items-center gap-0.5" title={`Sous-tâches: Backlog ${counts.backlog} • En cours ${counts.inProgress} • Bloqué ${counts.blocked} • Fait ${counts.done}`} aria-label={`Sous-tâches: Backlog ${counts.backlog}, En cours ${counts.inProgress}, Bloqué ${counts.blocked}, Fait ${counts.done}`}>
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
  );
}
