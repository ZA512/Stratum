"use client";
import React, { useState, FormEvent, useMemo } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useBoardData } from '@/features/boards/board-data-provider';
import { useTaskDrawer } from '@/features/nodes/task-drawer/TaskDrawerContext';
import { useToast } from '@/components/toast/ToastProvider';
import { createBoardColumn, updateBoardColumn, deleteBoardColumn, type UpdateBoardColumnInput } from '@/features/boards/boards-api';
import { createNode, updateNode, moveChildNode } from '@/features/nodes/nodes-api';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent, closestCorners, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ColumnList } from './ColumnList';
import type { BoardColumnWithNodes } from './types';

function BoardSkeleton(){
  return (
    <div className="flex gap-4 overflow-x-auto">
      {Array.from({length:4}).map((_,i)=>(
        <div key={i} className="min-w-[280px] animate-pulse rounded-2xl border border-white/10 bg-card/40 p-5">
          <div className="h-5 w-3/4 rounded bg-white/15" />
          <div className="mt-4 h-4 w-1/2 rounded bg-white/10" />
          <div className="mt-4 h-24 rounded-xl bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function TeamBoardPage(){
  const { user, accessToken, logout } = useAuth();
  const { board, status, error, refreshActiveBoard, childBoards, teamId } = useBoardData();
  const { open } = useTaskDrawer();
  const { success, error: toastError } = useToast();

  const loading = status==='loading' && !board;
  const detailLoading = status==='loading' && !!board;

  // New column form state
  const [isAddingColumn,setIsAddingColumn] = useState(false);
  const [columnName,setColumnName] = useState('');
  const [columnBehavior,setColumnBehavior] = useState<'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM'>('BACKLOG');
  const [columnWip,setColumnWip] = useState('');
  const [columnError,setColumnError] = useState<string|null>(null);
  const [columnSubmitting,setColumnSubmitting] = useState(false);

  // Edit column state
  const [editingColumnId,setEditingColumnId] = useState<string|null>(null);
  const [editingName,setEditingName] = useState('');
  const [editingWip,setEditingWip] = useState('');
  const [editingError,setEditingError] = useState<string|null>(null);
  const [editingSubmitting,setEditingSubmitting] = useState(false);

  // DnD + état optimiste
  const sensors = useSensors(useSensor(PointerSensor,{ activationConstraint:{ distance:5 }}));
  const [optimisticColumns,setOptimisticColumns] = useState<BoardColumnWithNodes[] | null>(null);
  const [draggingId,setDraggingId] = useState<string|null>(null);
  const [draggingCard,setDraggingCard] = useState<{ id:string; title:string } | null>(null);
  const [hideDone,setHideDone] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(true);

  const rawColumns: BoardColumnWithNodes[] | undefined = optimisticColumns ?? (board?.columns as BoardColumnWithNodes[] | undefined);
  const effectiveColumns: BoardColumnWithNodes[] | undefined = useMemo(()=>{
    if(!rawColumns) return rawColumns;
    if(!hideDone) return rawColumns;
    return rawColumns.filter(c=>c.behaviorKey !== 'DONE');
  }, [rawColumns, hideDone]);

  const resetColumnForm = () => { setColumnName(''); setColumnBehavior('BACKLOG'); setColumnWip(''); setColumnError(null); };

  // --- Utilitaire de gestion d'appels API avec toasts centralisés ---
  async function handleApi<T>(op:()=>Promise<T>, opts?: { success?: string; warnWip?: string; }) {
    try {
      const result = await op();
      if(opts?.success) success(opts.success);
      return result;
    } catch(e){
      const err = e as Error & { message?: string };
      const msg = (err?.message||'').toLowerCase();
      if(msg.includes('401') || msg.includes('unauthorized')) {
        toastError('Session expirée');
        logout();
      } else if(msg.includes('wip')) {
        // WIP spécifique → warning style (utilise error toast pour l'instant faute de canal distinct)
        toastError(opts?.warnWip || 'Limite WIP atteinte');
      } else {
        toastError(err.message || 'Erreur inattendue');
      }
      throw err;
    }
  }

  const handleSubmitColumn = async (e:FormEvent) => {
    e.preventDefault();
    if(!accessToken || !board){ setColumnError('Session invalide'); return; }
    if(!columnName.trim()){ setColumnError('Nom obligatoire'); return; }
  const payload: { name: string; behaviorKey: 'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM'; wipLimit?: number|null } = { name: columnName.trim(), behaviorKey: columnBehavior };
    if(columnWip.trim()){
      const n = parseInt(columnWip.trim(),10);
      if(!Number.isFinite(n) || n<=0){ setColumnError('WIP invalide'); return; }
      payload.wipLimit = n;
    }
    setColumnSubmitting(true); setColumnError(null);
    try {
      await handleApi(()=>createBoardColumn(board.id, payload, accessToken), { success: 'Colonne créée' });
      await refreshActiveBoard();
      setIsAddingColumn(false); resetColumnForm();
  } catch(e){ setColumnError((e as Error).message); } finally { setColumnSubmitting(false); }
  };

  const handleOpenColumnEditorById = (columnId:string) => {
    if(!board) return;
    const c = board.columns.find(col=>col.id===columnId) as BoardColumnWithNodes | undefined;
    if(!c) return;
    setEditingColumnId(c.id);
    setEditingName(c.name);
    setEditingWip(c.wipLimit?String(c.wipLimit):'');
    setEditingError(null);
  };
  const handleCancelEditColumn = () => { setEditingColumnId(null); setEditingError(null); };

  const handleUpdateColumn = async () => {
    if(!accessToken || !board || !editingColumnId) return; 
    const col = board.columns.find(c=>c.id===editingColumnId); if(!col) return;
    const name = editingName.trim();
    if(!name){ setEditingError('Nom obligatoire'); return; }
    const updates: UpdateBoardColumnInput = {};
    if(name !== col.name) updates.name = name;
    const w = editingWip.trim();
    if(w===''){ if(col.wipLimit !== null) updates.wipLimit = null; }
    else { const n=parseInt(w,10); if(!Number.isFinite(n)||n<=0){ setEditingError('WIP invalide'); return;} if(col.wipLimit !== n) updates.wipLimit = n; }
    if(Object.keys(updates).length===0){ setEditingColumnId(null); return; }
    setEditingSubmitting(true); setEditingError(null);
    try {
      await handleApi(()=>updateBoardColumn(board.id, col.id, updates, accessToken), { success: 'Colonne mise à jour' });
      await refreshActiveBoard();
      setEditingColumnId(null);
  } catch(e){ setEditingError((e as Error).message); } finally { setEditingSubmitting(false); }
  };

  const handleMoveColumn = async (columnId:string, direction:-1|1) => {
    if(!accessToken || !board) return;
    const idx = board.columns.findIndex(c=>c.id===columnId); if(idx===-1) return;
    const pos = idx + direction; if(pos<0 || pos>=board.columns.length) return;
    try {
      await handleApi(()=>updateBoardColumn(board.id, columnId, { position: pos }, accessToken));
      await refreshActiveBoard();
    } catch { /* déjà géré */ }
  };

  const handleDeleteColumn = async (columnId:string) => {
    if(!accessToken || !board) return;
    const col = board.columns.find(c=>c.id===columnId); if(!col) return;
    if(!window.confirm(`Supprimer la colonne "${col.name}" ?`)) return;
    try {
      await handleApi(()=>deleteBoardColumn(board.id, columnId, accessToken), { success: 'Colonne supprimée' });
      await refreshActiveBoard();
    } catch { /* toast déjà affiché */ }
  };

  const handleCreateCard = async (columnId:string, title:string) => {
    if(!accessToken || !board) throw new Error('Session invalide');
    await handleApi(()=>createNode({ title, columnId }, accessToken), { success: 'Carte créée' });
    await refreshActiveBoard();
  };

  const handleOpenCard = (id:string) => { open(id); };
  const handleRenameCard = async (id:string, newTitle:string) => {
    if(!accessToken) return; await handleApi(()=>updateNode(id,{ title: newTitle }, accessToken)); };

  // --- Drag & Drop (cartes) ---
  const onDragStart = (event:DragStartEvent) => {
    const { active } = event;
    if(!active) return;
    setDraggingId(String(active.id));
    const data = active.data.current as { columnId?: string; type?: string; node?: { id:string; title:string } } | undefined;
    if(data?.node){
      setDraggingCard({ id: data.node.id, title: data.node.title });
    }
  };
  const onDragEnd = async (event:DragEndEvent) => {
    setDraggingId(null);
    if(!accessToken || !board) return;
    const { active, over } = event;
    if(!active || !over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if(activeId === overId) return;
    const activeColId = (active.data.current as { columnId?: string } | undefined)?.columnId;
    let overColId = (over.data.current as { columnId?: string; type?: string } | undefined)?.columnId;
    if(!overColId && (over.data.current as { type?: string } | undefined)?.type === 'column') {
      overColId = over.id as string;
    }
    if(!activeColId) return;
    // Determine source & target columns from effective snapshot
    const currentCols = effectiveColumns ? structuredClone(effectiveColumns) : structuredClone(board.columns) as BoardColumnWithNodes[];
    const sourceCol = currentCols.find(c=>c.id===activeColId);
    const targetCol = overColId ? currentCols.find(c=>c.id===overColId) : undefined;
    // If over is a card, we might need its column
    if(!targetCol){
      // maybe overId is a column id
      const possible = currentCols.find(c=>c.id===overId);
      if(possible) overColId = possible.id;
    }
    const finalTargetCol = overColId ? currentCols.find(c=>c.id===overColId) : undefined;
    if(!sourceCol || !finalTargetCol) return;
    const sourceIndex = sourceCol.nodes?.findIndex(n=>n.id===activeId) ?? -1;
    if(sourceIndex === -1) return;
    const moving = sourceCol.nodes![sourceIndex];
    let targetIndex:number;
    if(sourceCol.id === finalTargetCol.id){
      // Reorder within same column
      const overIndex = finalTargetCol.nodes?.findIndex(n=>n.id===overId) ?? -1;
      targetIndex = overIndex === -1 ? (finalTargetCol.nodes!.length - 1) : overIndex;
      finalTargetCol.nodes = arrayMove(finalTargetCol.nodes || [], sourceIndex, targetIndex);
    } else {
      // Move across columns
      sourceCol.nodes = (sourceCol.nodes||[]).filter(n=>n.id!==moving.id);
      const overIndex = finalTargetCol.nodes?.findIndex(n=>n.id===overId) ?? -1;
      targetIndex = overIndex === -1 ? (finalTargetCol.nodes?.length ?? 0) : overIndex;
      const newArr = [...(finalTargetCol.nodes||[])];
      newArr.splice(targetIndex,0,moving);
      finalTargetCol.nodes = newArr;
    }
    const snapshot = optimisticColumns ? structuredClone(optimisticColumns) : structuredClone(board.columns) as BoardColumnWithNodes[];
    setOptimisticColumns(currentCols);
    try {
      await handleApi(()=>moveChildNode(moving.parentId || moving.id, moving.id, { targetColumnId: finalTargetCol.id, position: targetIndex }, accessToken), { success: 'Tâche déplacée', warnWip: 'Limite WIP atteinte' });
      await refreshActiveBoard();
      setOptimisticColumns(null);
    } catch {
      setOptimisticColumns(snapshot); // rollback
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Stratum</p>
            <h1 className="text-3xl font-semibold">{board?board.name:'Board'}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold">{user?.displayName}</p>
              <p className="text-[11px] uppercase tracking-[0.35em] text-muted">Équipe {teamId}</p>
            </div>
            <button onClick={logout} className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground">Déconnexion</button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="grid gap-6">
          <div className="rounded-2xl border border-white/10 bg-card/70 p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted">Ajoutez des colonnes pour structurer votre board.</p>
              {!isAddingColumn && (
                <button onClick={()=>setIsAddingColumn(true)} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:bg-accent-strong">Nouvelle colonne</button>
              )}
              <div className="flex items-center gap-4 text-xs text-muted select-none">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-accent" checked={hideDone} onChange={e=>setHideDone(e.target.checked)} />
                  Masquer colonnes DONE
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-accent" checked={showDescriptions} onChange={e=>setShowDescriptions(e.target.checked)} />
                  Description on/off
                </label>
              </div>
            </div>
            {isAddingColumn && (
              <form onSubmit={handleSubmitColumn} className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-xs text-muted">Nom
                  <input value={columnName} onChange={e=>setColumnName(e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" required />
                </label>
                <label className="text-xs text-muted">Comportement
                  <select value={columnBehavior} onChange={e=>setColumnBehavior(e.target.value as 'BACKLOG'|'IN_PROGRESS'|'BLOCKED'|'DONE'|'CUSTOM')} className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent">
                    <option value="BACKLOG">Backlog</option>
                    <option value="IN_PROGRESS">En cours</option>
                    <option value="BLOCKED">Bloqué</option>
                    <option value="DONE">Terminé</option>
                    <option value="CUSTOM">Custom</option>
                  </select>
                </label>
                <label className="text-xs text-muted">WIP (optionnel)
                  <input type="number" min={1} value={columnWip} onChange={e=>setColumnWip(e.target.value)} placeholder="Illimité" className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm outline-none focus:border-accent" />
                </label>
                <div className="flex items-center gap-3 pt-4">
                  <button disabled={columnSubmitting} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background disabled:opacity-60">{columnSubmitting?'Création…':'Créer'}</button>
                  <button type="button" onClick={()=>{ setIsAddingColumn(false); resetColumnForm(); }} className="text-sm text-muted hover:text-foreground">Annuler</button>
                </div>
                {columnError && <p className="text-sm text-red-300 col-span-2">{columnError}</p>}
              </form>
            )}
          </div>
        </section>
        {error && <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-200">{error}</div>}
        {loading && <BoardSkeleton />}
        {!loading && board && (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold">Colonnes du board</h2>
              <span className="text-xs uppercase tracking-wide text-muted">
                {detailLoading? 'Actualisation…': board.columns.length===0? 'Aucune colonne': `${board.columns.length} colonne(s)`}
              </span>
            </div>
            {effectiveColumns && effectiveColumns.length>0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <ColumnList
                  columns={effectiveColumns}
                  childBoards={childBoards}
                  editingColumnId={editingColumnId}
                  editingValues={{ name: editingName, wip: editingWip, submitting: editingSubmitting, error: editingError }}
                  loadingCards={detailLoading}
                  showDescriptions={showDescriptions}
                  onRequestEdit={handleOpenColumnEditorById}
                  onCancelEdit={handleCancelEditColumn}
                  onSubmitEdit={handleUpdateColumn}
                  onFieldChange={(field,val)=> field==='name'? setEditingName(val): setEditingWip(val)}
                  onMoveColumn={handleMoveColumn}
                  onDeleteColumn={handleDeleteColumn}
                  onCreateCard={handleCreateCard}
                  onOpenCard={handleOpenCard}
                  onRenameCard={handleRenameCard}
                />
              <DragOverlay dropAnimation={null}>
                {draggingCard && (
                  <div className="pointer-events-none w-64 rounded-xl border border-accent/40 bg-card/90 px-4 py-3 shadow-2xl backdrop-blur">
                    <p className="text-sm font-medium">{draggingCard.title}</p>
                  </div>
                )}
              </DragOverlay>
              </DndContext>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/15 bg-card/60 p-8 text-center">
                <p className="text-sm text-muted">Ce board n&apos;a pas encore de colonnes.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default TeamBoardPage;
