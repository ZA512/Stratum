"use client";
import React from 'react';
import { Reorder } from 'framer-motion';
import type { NodeDetail, NodeChild } from '../types';
import { useTaskDrawer } from './TaskDrawerContext';
import { useAuth } from '@/features/auth/auth-provider';
import { createChildTask, toggleChildTaskDone, updateChildTask, reorderChildren } from '../../nodes/children-api';
import { useToast } from '@/components/toast/ToastProvider';
import { useBoardData } from '@/features/boards/board-data-provider';

const FIELD_INPUT_BASE =
  'rounded border border-border/60 bg-input text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-colors';

export const ChildTasksSection: React.FC = () => {
  const { detail, refresh, applyDetail } = useTaskDrawer();
  const { accessToken } = useAuth();
  const { refreshActiveBoard } = useBoardData();
  const { success } = useToast();
  const [creating, setCreating] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Optimistic state with snapshot stack & pending guard
  const [optimisticChildren, setOptimisticChildren] = React.useState<NodeChild[]>(() => detail?.children ?? []);
  const snapshotStackRef = React.useRef<typeof optimisticChildren[]>([]);
  const pendingRef = React.useRef(0);
  function pushSnapshot(){
    const snap = JSON.parse(JSON.stringify(optimisticChildren));
    snapshotStackRef.current.push(snap);
    if (snapshotStackRef.current.length > 5) snapshotStackRef.current.shift();
  }
  function rollback(){
    const last = snapshotStackRef.current.pop();
    if (last) { setOptimisticChildren(last); }
  }
  function beginPending(){ pendingRef.current++; }
  function endPending(){ pendingRef.current = Math.max(0, pendingRef.current-1); }
  function hasPending(){ return pendingRef.current > 0; }
  React.useEffect(() => {
    if (!detail) {
      setOptimisticChildren([]);
      snapshotStackRef.current = [];
      return;
    }
    setOptimisticChildren(detail.children);
    snapshotStackRef.current = [];
  }, [detail]);
  // Ne pas faire de early return ici (sinon ordre des hooks varie si detail devient null)
  const parentId = detail?.id ?? null;

  // Counts locaux dérivés à partir de l'état optimiste
  function deriveCounts(children: NodeChild[]){
    let backlog=0,inProgress=0,blocked=0,done=0;
    for (const c of children) {
      switch(c.behaviorKey){
        case 'DONE': done++; break;
        case 'IN_PROGRESS': inProgress++; break;
        case 'BLOCKED': blocked++; break;
        default: backlog++; break;
      }
    }
    return { backlog, inProgress, blocked, done };
  }
  const [localCounts, setLocalCounts] = React.useState(()=>deriveCounts(optimisticChildren));
  React.useEffect(()=>{ setLocalCounts(deriveCounts(optimisticChildren)); }, [optimisticChildren]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !parentId) return;
    const t = title.trim();
    if (!t) return;
    setCreating(true);
    setError(null);
    const tempId = 'tmp-'+Date.now();
    pushSnapshot();
    beginPending();
    // Placeholder enfant typé
    setOptimisticChildren(list => [...list, { id: tempId, title: t, type: 'SIMPLE', columnId: null, behaviorKey: 'BACKLOG' }]);
    setTitle("");
    try {
      const responseParent = await createChildTask(parentId, { title: t }, accessToken);
      if (responseParent?.children) {
        setOptimisticChildren(responseParent.children as NodeChild[]);
        setLocalCounts(deriveCounts(responseParent.children as NodeChild[]));
        // Appliquer immediatement le detail parent pour eviter un retour au cache stale
        applyDetail?.(responseParent as NodeDetail);
        // L'ordre backlog sera dérivé au prochain rendu
      }
      // Synchronise aussi le detail parent (header, autres sections)
      refresh?.();
      void refreshActiveBoard();
    } catch (err) {
      rollback();
      setError((err as Error).message ?? 'Creation echouee, revert');
    } finally {
      endPending();
      setCreating(false);
    }
  }

  async function toggle(childId: string) {
    if (!accessToken || !parentId) return;
    const child = optimisticChildren.find(c=>c.id===childId);
    if (!child) return;
    
    pushSnapshot();
    beginPending();

    const currentBehavior = (child.behaviorKey ?? 'BACKLOG');
    const targetBehavior = currentBehavior === 'DONE' ? 'BACKLOG' : 'DONE';

    // Mise à jour optimiste
    const nextChildren: NodeChild[] = optimisticChildren.map(c=> c.id===childId ? { ...c, behaviorKey: targetBehavior } : c);
    setOptimisticChildren(nextChildren);

    try {
      const responseParent = await toggleChildTaskDone(parentId, childId, accessToken);

      if (responseParent?.children) {
        const children = responseParent.children as NodeChild[];
        setOptimisticChildren(children);
        setLocalCounts(deriveCounts(children));
        applyDetail?.(responseParent as NodeDetail);
      } else {
        refresh?.();
      }
      void refreshActiveBoard();
      
      // Feedback utilisateur
      try {
        success(targetBehavior === 'DONE' ? 'Sous-tâche marquée terminée' : 'Sous-tâche remise en backlog');
      } catch {}
      
      setTimeout(() => {
        const el = document.getElementById(`child-${childId}`);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
      
    } catch {
      rollback();
      setError('Echec toggle, revert');
    } finally {
      endPending();
    }
  }

  // Liste plate : backlog (non DONE) puis done (DONE) en respectant l'ordre courant
  const backlogItems = React.useMemo(() => optimisticChildren.filter(c=>c.behaviorKey !== 'DONE'), [optimisticChildren]);
  const doneItems = React.useMemo(() => optimisticChildren.filter(c=>c.behaviorKey === 'DONE'), [optimisticChildren]);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  function startEdit(id: string, current: string) {
    setEditingId(id); setEditingTitle(current);
  }
  async function saveEdit(id: string) {
    if (!accessToken || !parentId) return;
    const trimmed = editingTitle.trim();
    if (!trimmed) { setEditingId(null); return; }
    pushSnapshot();
    beginPending();
    // Mutation locale optimiste
    setOptimisticChildren(list => list.map(c=> c.id===id ? { ...c, title: trimmed } : c));
    setEditingId(null);
    try {
      await updateChildTask(parentId, id, { title: trimmed }, accessToken);
      // Pas de refresh immédiat nécessaire (titre déjà synchro)
    } catch {
      rollback();
      setError('Echec édition, revert');
    } finally {
      endPending();
    }
  }

  // Reorder backlog (seulement pour items non DONE)

  // Reorder local backlog (pas de persistance pour l'instant – simple réordonner local)
  const backlogIds = React.useMemo(() => backlogItems.map(i=>i.id), [backlogItems]);
  function onReorderBacklog(newOrder: string[]) {
    // Réappliquer ordre local optimiste
    setOptimisticChildren(list => {
      const map = new Map(list.map(i=>[i.id,i] as const));
      const currentDone = list.filter(i=>i.behaviorKey === 'DONE').map(i=>i.id);
      // Reconstituer backlog selon newOrder (qui ne contient que backlog ids)
      const reorderedBacklog = newOrder.map(id=>map.get(id)!).filter(Boolean);
      // Conserver l'ordre courant des DONE tel qu'il est dans 'list'
      const reorderedDone = currentDone.map(id=>map.get(id)!).filter(Boolean);
      return [...reorderedBacklog, ...reorderedDone];
    });
    // Debounce persistance
    schedulePersist(newOrder);
  }

  const persistTimer = React.useRef<number | null>(null);
  function schedulePersist(order: string[]) {
    if (!accessToken || !parentId) return;
    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
    }
    const columnId = detail?.board?.columns.find(c=>c.behaviorKey==='BACKLOG')?.id || backlogItems[0]?.columnId || '';
    const payload = { columnId, orderedIds: order };
    persistTimer.current = window.setTimeout(async ()=>{
      pushSnapshot();
      beginPending();
      try {
        await reorderChildren(parentId!, payload, accessToken!);
      } catch {
        rollback(); setError('Echec du reorder, revert');
      } finally {
        endPending();
        persistTimer.current = null;
      }
    }, 300);
  }

  // Drag inter-colonnes supprimé (liste unique)

  if(!detail || !parentId){
    return <div className="mt-6 text-xs text-slate-500">Chargement…</div>;
  }
  return (
    <div className="mt-6 space-y-4 relative" key={detail.id}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasPending() && (
            <div className="text-[11px] px-2 py-0.5 rounded bg-amber-200 text-amber-800 border border-amber-300 shadow-sm uppercase tracking-wide">Sync…</div>
          )}
        </div>
        <div className="flex items-center gap-0.5 text-sm font-mono">
          <span className="text-amber-600 dark:text-amber-400">{localCounts.backlog}</span>
          <span className="text-slate-400">.</span>
          <span className="text-sky-600 dark:text-sky-400">{localCounts.inProgress}</span>
          <span className="text-slate-400">.</span>
          <span className="text-rose-600 dark:text-rose-400">{localCounts.blocked}</span>
          <span className="text-slate-400">.</span>
          <span className="text-emerald-600 dark:text-emerald-400">{localCounts.done}</span>
        </div>
        <form onSubmit={onCreate} className="flex w-full flex-col gap-2 rounded-lg border border-dashed border-border/40 bg-card/40 p-3 sm:flex-row sm:items-center">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <span className="sr-only">Nouvelle sous-tâche</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nouvelle sous-tâche"
              className={`mt-1 w-full ${FIELD_INPUT_BASE} px-3 py-2 text-sm`}
              disabled={creating}
            />
          </label>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-base" aria-hidden>add_circle</span>
            Ajouter
          </button>
        </form>
      </div>
      <div className="space-y-3">
        <Reorder.Group axis="y" values={backlogIds} onReorder={onReorderBacklog} className="space-y-1">
          {backlogIds.map(id => {
            const c = backlogItems.find(i=>i.id===id);
            if(!c) return null;
            const isDone = c.behaviorKey === 'DONE';
            return (
              <Reorder.Item
                value={id}
                key={id}
                as="div"
                id={`child-${id}`}
                className="group flex items-start gap-3 rounded border border-border/50 bg-card px-3 py-2 text-sm text-foreground shadow-sm transition hover:border-accent/40 hover:bg-card/80 cursor-grab"
                whileDrag={{ scale:1.02, boxShadow:'0 4px 12px rgba(0,0,0,0.18)' }}
              >
                <button
                  type="button"
                  onMouseDown={(e)=>{ e.stopPropagation(); }}
                  onClick={(e)=>{ e.stopPropagation(); toggle(c.id); }}
                  role="checkbox"
                  aria-checked={isDone}
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-input text-muted transition hover:bg-card"
                  title={isDone? 'Remettre en Backlog':'Marquer terminé'}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>
                    {isDone ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                </button>
                {editingId === c.id ? (
                  <input className="flex-1 border-b border-blue-500 focus:outline-none bg-transparent dark:placeholder-slate-400" autoFocus value={editingTitle} onChange={e=>setEditingTitle(e.target.value)} onBlur={()=>saveEdit(c.id)} onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault(); saveEdit(c.id);} if(e.key==='Escape'){ setEditingId(null);} }} />
                ) : (
                  <span className="flex-1 leading-5 select-text cursor-text" onDoubleClick={()=>startEdit(c.id, c.title)}>{c.title}</span>
                )}
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        {doneItems.length>0 && (
          <div className="pt-3 border-t border-border/40 space-y-1">
            {doneItems.map(c => (
              <div key={c.id} id={`child-${c.id}`} className="flex items-start gap-2 rounded bg-card/40 px-3 py-2 text-sm text-muted line-through">
                <button
                  type="button"
                  onMouseDown={(e)=>{ e.stopPropagation(); }}
                  onClick={(e)=>{ e.stopPropagation(); toggle(c.id); }}
                  role="checkbox"
                  aria-checked={true}
                  className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300"
                  title="Remettre en Backlog"
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>check_circle</span>
                </button>
                {editingId === c.id ? (
                  <input className="flex-1 border-b border-blue-500 focus:outline-none bg-transparent dark:placeholder-slate-400" autoFocus value={editingTitle} onChange={e=>setEditingTitle(e.target.value)} onBlur={()=>saveEdit(c.id)} onKeyDown={e=>{ if(e.key==='Enter'){e.preventDefault(); saveEdit(c.id);} if(e.key==='Escape'){ setEditingId(null);} }} />
                ) : (
                  <span className="flex-1 select-text cursor-text" onDoubleClick={()=>startEdit(c.id, c.title)}>{c.title}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
        {error && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-50">
            <div className="animate-fade-in-up bg-red-600 text-white text-xs px-3 py-2 rounded shadow-lg flex items-center gap-2">
              <span>{error}</span>
              <button
                onClick={()=>setError(null)}
                className="pointer-events-auto bg-red-500/40 hover:bg-red-500/60 rounded px-1 text-[10px]"
              >x</button>
            </div>
          </div>
        )}
        <p className="text-[10px] text-gray-400">Double-clic pour éditer, glisser pour réordonner (Backlog). Cocher pour terminer.</p>
    </div>
  );
};
