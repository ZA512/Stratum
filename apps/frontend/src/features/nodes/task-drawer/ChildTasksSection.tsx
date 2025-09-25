"use client";
import React from 'react';
import { Reorder } from 'framer-motion';
import type { NodeDetail, NodeChild } from '../types';
import { useTaskDrawer } from './TaskDrawerContext';
import { useAuth } from '@/features/auth/auth-provider';
import { createChildTask, toggleChildTaskDone, updateChildTask, reorderChildren } from '../../nodes/children-api';
import { useToast } from '@/components/toast/ToastProvider';

export const ChildTasksSection: React.FC = () => {
  const { detail, refresh, applyDetail } = useTaskDrawer();
  const { accessToken } = useAuth();
  const { success } = useToast();
  const [creating, setCreating] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Optimistic state with snapshot stack & pending guard
  const [optimisticChildren, setOptimisticChildren] = React.useState<NodeChild[]>(() => detail?.children ?? []);
  const [isDirty, setIsDirty] = React.useState(false); // conservé pour rollback & état visuel futur
  const snapshotStackRef = React.useRef<typeof optimisticChildren[]>([]);
  const pendingRef = React.useRef(0);
  function pushSnapshot(){
    const snap = JSON.parse(JSON.stringify(optimisticChildren));
    snapshotStackRef.current.push(snap);
    if (snapshotStackRef.current.length > 5) snapshotStackRef.current.shift();
  }
  function rollback(){
    const last = snapshotStackRef.current.pop();
    if (last) { setOptimisticChildren(last); setIsDirty(false); }
  }
  function beginPending(){ pendingRef.current++; }
  function endPending(){ pendingRef.current = Math.max(0, pendingRef.current-1); }
  function hasPending(){ return pendingRef.current > 0; }
  // Adopter les enfants du parent uniquement quand on change de tâche parente
  const prevParentIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (detail?.id && prevParentIdRef.current !== detail.id) {
      setOptimisticChildren(detail.children);
      prevParentIdRef.current = detail.id;
    }
  }, [detail?.id]);
  // Ne pas faire de early return ici (sinon ordre des hooks varie si detail devient null)
  const parentId = detail?.id || null;

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
    setIsDirty(true);
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
      setIsDirty(false);
      // Synchronise aussi le detail parent (header, autres sections)
      refresh?.();
    } catch (err) {
      rollback();
      setError((err as Error).message ?? 'Creation echouee, revert');
    } finally {
      setCreating(false);
    }
  }

  async function toggle(childId: string) {
    if (!accessToken || !parentId) return;
    const child = optimisticChildren.find(c=>c.id===childId);
    if (!child) return;
    
    pushSnapshot();
    setIsDirty(true);
    
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
      
      setIsDirty(false);
      
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
      
    } catch (e) {
      rollback();
      setError('Echec toggle, revert');
    }
  }  // Liste plate : backlog (non DONE) puis done (DONE) en respectant l'ordre courant
  const backlogItems = optimisticChildren.filter(c=>c.behaviorKey !== 'DONE');
  const doneItems = optimisticChildren.filter(c=>c.behaviorKey === 'DONE');

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
    setIsDirty(true);
    // Mutation locale optimiste
    setOptimisticChildren(list => list.map(c=> c.id===id ? { ...c, title: trimmed } : c));
    setEditingId(null);
    try {
  await updateChildTask(parentId, id, { title: trimmed }, accessToken);
      setIsDirty(false);
      // Pas de refresh immédiat nécessaire (titre déjà synchro)
    } catch (e) {
      rollback();
      setError('Echec édition, revert');
    }
  }

  // Reorder backlog (seulement pour items non DONE)

  // Reorder local backlog (pas de persistance pour l'instant – simple réordonner local)
  const backlogIds = React.useMemo(() => backlogItems.map(i=>i.id), [backlogItems]);
  function onReorderBacklog(newOrder: string[]) {
    // Réappliquer ordre local optimiste
    setOptimisticChildren(list => {
      const map = new Map(list.map(i=>[i.id,i] as const));
      const currentBacklog = list.filter(i=>i.behaviorKey !== 'DONE').map(i=>i.id);
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
      pushSnapshot(); setIsDirty(true);
      try {
        await reorderChildren(parentId!, payload, accessToken!);
        setIsDirty(false);
      } catch (e) {
        rollback(); setError('Echec du reorder, revert');
      }
    }, 300);
  }

  // Drag inter-colonnes supprimé (liste unique)

  if(!detail || !parentId){
    return <div className="mt-6 text-xs text-slate-500">Chargement…</div>;
  }
  return (
    <div className="mt-6 space-y-4 relative" key={detail.id}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">Sous-taches</h3>
        {localCounts && (
          <div className="text-xs text-gray-500">
            B:{localCounts.backlog} • En cours:{localCounts.inProgress} • Bloque:{localCounts.blocked} • Fait:{localCounts.done}
          </div>
        )}
      </div>
      {hasPending() && (
        <div className="absolute top-0 right-0 translate-y-[-60%] text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-800 border border-amber-300 shadow-sm">Sync…</div>
      )}
      <div className="space-y-3">
        <Reorder.Group axis="y" values={backlogIds} onReorder={onReorderBacklog} className="space-y-1">
          {backlogIds.map(id => {
            const c = backlogItems.find(i=>i.id===id);
            if(!c) return null;
            const isDone = c.behaviorKey === 'DONE';
            return (
              <Reorder.Item value={id} key={id} as="div" id={`child-${id}`} className="group flex items-start gap-2 rounded px-3 py-2 bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100 text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-grab transition" whileDrag={{ scale:1.02, boxShadow:'0 4px 12px rgba(0,0,0,0.18)' }}>
                <button
                  type="button"
                  onMouseDown={(e)=>{ e.stopPropagation(); }}
                  onClick={(e)=>{ e.stopPropagation(); toggle(c.id); }}
                  role="checkbox"
                  aria-checked={isDone}
                  className={
                    "mt-0.5 h-4 w-4 flex-shrink-0 rounded flex items-center justify-center text-[10px] transition " +
                    (isDone
                      ? "border border-green-500 bg-green-500 text-white"
                      : "border border-slate-400 dark:border-slate-500 hover:border-slate-500")
                  }
                  title={isDone? 'Remettre en Backlog':'Marquer terminé'}
                >
                  {isDone ? '✓' : ''}
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
          <div className="pt-3 border-t border-slate-300 dark:border-slate-600 space-y-1">
            {doneItems.map(c => (
              <div key={c.id} id={`child-${c.id}`} className="flex items-start gap-2 rounded px-3 py-2 bg-slate-100 dark:bg-slate-700 text-sm text-slate-500 dark:text-slate-300 line-through">
                <button
                  type="button"
                  onMouseDown={(e)=>{ e.stopPropagation(); }}
                  onClick={(e)=>{ e.stopPropagation(); toggle(c.id); }}
                  role="checkbox"
                  aria-checked={true}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded flex items-center justify-center text-[10px] border border-green-500 bg-green-500 text-white"
                  title="Remettre en Backlog"
                >✓</button>
                <span className="flex-1 select-text cursor-text" onDoubleClick={()=>startEdit(c.id, c.title)}>{c.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <form onSubmit={onCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nouvelle sous-tache"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring focus:ring-blue-500/30"
          disabled={creating}
        />
        <button
          type="submit"
          disabled={creating || !title.trim()}
          className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-40"
        >Ajouter</button>
      </form>
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
