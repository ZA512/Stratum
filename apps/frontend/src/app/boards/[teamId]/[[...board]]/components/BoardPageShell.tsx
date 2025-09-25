"use client";
import React, { useState, FormEvent, useMemo, useEffect } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import { useBoardData } from '@/features/boards/board-data-provider';
import { useTaskDrawer } from '@/features/nodes/task-drawer/TaskDrawerContext';
import { useToast } from '@/components/toast/ToastProvider';
import { createBoardColumn, updateBoardColumn, deleteBoardColumn, type UpdateBoardColumnInput } from '@/features/boards/boards-api';
import { createNode, updateNode, moveChildNode, deleteNode as apiDeleteNode, fetchNodeDeletePreview, type NodeDeletePreview } from '@/features/nodes/nodes-api';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent, closestCorners, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { ColumnList } from './ColumnList';
import type { BoardColumnWithNodes } from './types';
import type { BoardNode } from '@/features/boards/boards-api';

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
  const [draggingCard,setDraggingCard] = useState<{ id:string; title:string } | null>(null);
  const UNASSIGNED_TOKEN = '__UNASSIGNED__';
  const PRIORITY_OPTIONS: Array<{ value: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST'; label: string }> = [
    { value: 'CRITICAL', label: 'Critique' },
    { value: 'HIGH', label: 'Haute' },
    { value: 'MEDIUM', label: 'Moyenne' },
    { value: 'LOW', label: 'Basse' },
    { value: 'LOWEST', label: 'Très basse' },
    { value: 'NONE', label: 'Aucune' },
  ];
  const [hideDone,setHideDone] = useState(false);
  const [showDescriptions, setShowDescriptions] = useState(true);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<Array<'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST'>>([]);
  const [filterMine, setFilterMine] = useState(false);
  const [filterHasChildren, setFilterHasChildren] = useState(false);
  const [sortPriority, setSortPriority] = useState(false);
  const [sortDueDate, setSortDueDate] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BoardNode | null>(null);
  const [deletePreview, setDeletePreview] = useState<NodeDeletePreview | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState<'single' | 'recursive' | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const storageKey = board?.id ? `stratum:board:${board.id}:filters` : null;

  const rawColumns: BoardColumnWithNodes[] | undefined = optimisticColumns ?? (board?.columns as BoardColumnWithNodes[] | undefined);
  const effectiveColumns: BoardColumnWithNodes[] | undefined = useMemo(()=>{
    if(!rawColumns) return rawColumns;
    if(!hideDone) return rawColumns;
    return rawColumns.filter(c=>c.behaviorKey !== 'DONE');
  }, [rawColumns, hideDone]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const trimmed = searchDraft.trim();
      setSearchQuery(trimmed.length >= 3 ? trimmed : '');
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchDraft]);

  useEffect(() => {
    if (!storageKey) {
      setFiltersHydrated(false);
      return;
    }
    if (typeof window === 'undefined') return;

    setSelectedAssignees([]);
    setSelectedPriorities([]);
    setFilterMine(false);
    setFilterHasChildren(false);
    setSortPriority(false);
    setSortDueDate(false);
    setSearchDraft('');
    setSearchQuery('');
    setHideDone(false);
    setShowDescriptions(true);

    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          hideDone?: unknown;
          showDescriptions?: unknown;
          selectedAssignees?: unknown;
          selectedPriorities?: unknown;
          filterMine?: unknown;
          filterHasChildren?: unknown;
          sortPriority?: unknown;
          sortDueDate?: unknown;
          search?: unknown;
        };
        if (typeof parsed.hideDone === 'boolean') setHideDone(parsed.hideDone);
        if (typeof parsed.showDescriptions === 'boolean')
          setShowDescriptions(parsed.showDescriptions);
        if (Array.isArray(parsed.selectedAssignees) && parsed.selectedAssignees.every((value) => typeof value === 'string'))
          setSelectedAssignees(parsed.selectedAssignees);
        if (
          Array.isArray(parsed.selectedPriorities) &&
          parsed.selectedPriorities.every((value) =>
            value === 'NONE' ||
            value === 'CRITICAL' ||
            value === 'HIGH' ||
            value === 'MEDIUM' ||
            value === 'LOW' ||
            value === 'LOWEST'
          )
        )
          setSelectedPriorities(parsed.selectedPriorities);
        if (typeof parsed.filterMine === 'boolean') setFilterMine(parsed.filterMine);
        if (typeof parsed.filterHasChildren === 'boolean')
          setFilterHasChildren(parsed.filterHasChildren);
        if (typeof parsed.sortPriority === 'boolean') setSortPriority(parsed.sortPriority);
        if (typeof parsed.sortDueDate === 'boolean') setSortDueDate(parsed.sortDueDate);
        if (typeof parsed.search === 'string') {
          setSearchDraft(parsed.search);
          const trimmed = parsed.search.trim();
          setSearchQuery(trimmed.length >= 3 ? trimmed : '');
        }
      } catch {
        // Ignore corrupted payloads; defaults already applied.
      }
    }
    setFiltersHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !filtersHydrated) return;
    if (typeof window === 'undefined') return;
    const payload = {
      hideDone,
      showDescriptions,
      selectedAssignees,
      selectedPriorities,
      filterMine,
      filterHasChildren,
      sortPriority,
      sortDueDate,
      search: searchDraft,
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Storage may be unavailable (quota, private mode); fail silently.
    }
  }, [storageKey, filtersHydrated, hideDone, showDescriptions, selectedAssignees, selectedPriorities, filterMine, filterHasChildren, sortPriority, sortDueDate, searchDraft]);

  const allAssignees = useMemo(() => {
    const map = new Map<string, { id: string; displayName: string }>();
    if (!board?.columns) return [] as Array<{ id: string; displayName: string }>;
    for (const column of board.columns) {
      const nodes = column.nodes ?? [];
      for (const node of nodes) {
        const assignees = node.assignees ?? [];
        for (const assignee of assignees) {
          if (!map.has(assignee.id)) {
            map.set(assignee.id, { id: assignee.id, displayName: assignee.displayName });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }));
  }, [board?.columns]);

  const displayedColumns: BoardColumnWithNodes[] | undefined = useMemo(() => {
    if (!effectiveColumns) return effectiveColumns;

    const priorityWeight: Record<'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST', number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3,
      LOWEST: 4,
      NONE: 5,
    };

    return effectiveColumns.map((column) => {
      const baseCards = [...(column.nodes ?? [])].sort((a, b) => a.position - b.position);
      let filtered = baseCards;

      if (selectedAssignees.length > 0) {
        filtered = filtered.filter((card) => {
          const assignees = card.assignees ?? [];
          const hasAssignments = assignees.length > 0;
          const includeUnassigned = selectedAssignees.includes(UNASSIGNED_TOKEN);
          if (!hasAssignments && includeUnassigned) return true;
          if (!hasAssignments) return false;
          const assigneeIds = new Set(assignees.map((a) => a.id));
          return selectedAssignees.some((id) => id !== UNASSIGNED_TOKEN && assigneeIds.has(id));
        });
      }

      if (selectedPriorities.length > 0) {
        filtered = filtered.filter((card) => selectedPriorities.includes(card.priority ?? 'NONE'));
      }

      if (filterMine && user?.id) {
        filtered = filtered.filter((card) => (card.assignees ?? []).some((a) => a.id === user.id));
      }

      if (filterHasChildren) {
        filtered = filtered.filter((card) => Boolean(childBoards[card.id]));
      }

      if (searchQuery) {
        const needle = searchQuery.toLowerCase();
        filtered = filtered.filter((card) => {
          const title = card.title.toLowerCase();
          const description = (card.description ?? '').toLowerCase();
          const shortId = typeof card.shortId === 'number' ? `#${card.shortId}` : '';
          return (
            title.includes(needle) ||
            description.includes(needle) ||
            shortId.toLowerCase().includes(needle)
          );
        });
      }

      if (sortPriority || sortDueDate) {
        filtered = [...filtered].sort((a, b) => {
          if (sortPriority) {
            const pa = priorityWeight[a.priority ?? 'NONE'];
            const pb = priorityWeight[b.priority ?? 'NONE'];
            if (pa !== pb) return pa - pb;
          }
          if (sortDueDate) {
            const da = a.dueAt ? new Date(a.dueAt).getTime() : null;
            const db = b.dueAt ? new Date(b.dueAt).getTime() : null;
            if (da !== db) {
              if (da === null) return 1;
              if (db === null) return -1;
              return da - db;
            }
          }
          return a.position - b.position;
        });
      }

      return { ...column, nodes: filtered };
    });
  }, [effectiveColumns, selectedAssignees, selectedPriorities, filterMine, user?.id, filterHasChildren, childBoards, searchQuery, sortPriority, sortDueDate]);

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

  const handleRequestMoveCard = (node: BoardNode) => {
    toastError(`Déplacement multi-board non disponible pour «${node.title}» pour le moment.`);
  };

  const handleRequestDeleteCard = (node: BoardNode) => {
    setDeleteTarget(node);
    setDeletePreview(null);
    setDeleteError(null);
    setDeleteSubmitting(null);
    setDeleteLoading(true);
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeletePreview(null);
    setDeleteError(null);
    setDeleteSubmitting(null);
    setDeleteLoading(false);
  };

  useEffect(() => {
    if (!deleteTarget || !deleteLoading || !accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const preview = await fetchNodeDeletePreview(deleteTarget.id, accessToken);
        if (!cancelled) {
          setDeletePreview(preview);
          setDeleteLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setDeleteError((err as Error).message);
          setDeleteLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deleteTarget, deleteLoading, accessToken]);

  const confirmDelete = async (recursive: boolean) => {
    if (!deleteTarget || !accessToken) return;
    setDeleteSubmitting(recursive ? 'recursive' : 'single');
    setDeleteError(null);
    try {
      await apiDeleteNode(deleteTarget.id, { recursive }, accessToken);
      success(recursive ? 'Tâche et sous-éléments supprimés' : 'Tâche supprimée');
      closeDeleteDialog();
      await refreshActiveBoard();
    } catch (err) {
      setDeleteError((err as Error).message);
      setDeleteSubmitting(null);
    }
  };

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  };

  const togglePriority = (value: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST') => {
    setSelectedPriorities((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
  };

  const hasActiveFilters = selectedAssignees.length > 0 || selectedPriorities.length > 0 || filterMine || filterHasChildren || Boolean(searchQuery) || sortPriority || sortDueDate;

  const resetFilters = () => {
    setSelectedAssignees([]);
    setSelectedPriorities([]);
    setFilterMine(false);
    setFilterHasChildren(false);
    setSortPriority(false);
    setSortDueDate(false);
    setSearchDraft('');
    setSearchQuery('');
  };

  // --- Drag & Drop (cartes) ---
  const onDragStart = (event:DragStartEvent) => {
    const { active } = event;
    if(!active) return;
    const data = active.data.current as { columnId?: string; type?: string; node?: { id:string; title:string } } | undefined;
    if(data?.node){
      setDraggingCard({ id: data.node.id, title: data.node.title });
    }
  };
  const onDragEnd = async (event:DragEndEvent) => {
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
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted select-none">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-accent" checked={hideDone} onChange={e=>setHideDone(e.target.checked)} />
                  Masquer colonnes DONE
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="accent-accent" checked={showDescriptions} onChange={e=>setShowDescriptions(e.target.checked)} />
                  Description on/off
                </label>
              </div>
              <div className="mt-4 space-y-4 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={()=> setFilterMine((prev) => !prev)}
                    className={`rounded-full border px-3 py-1 font-semibold tracking-wide transition ${filterMine ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
                    aria-pressed={filterMine}
                  >
                    Mes tâches
                  </button>
                  <button
                    type="button"
                    onClick={()=> setFilterHasChildren((prev) => !prev)}
                    className={`rounded-full border px-3 py-1 font-semibold tracking-wide transition ${filterHasChildren ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
                    aria-pressed={filterHasChildren}
                  >
                    Avec sous-kanban
                  </button>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="rounded-full border border-white/15 px-3 py-1 font-semibold tracking-wide text-muted transition hover:border-accent hover:text-foreground"
                    >
                      Réinitialiser
                    </button>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-1 text-muted">
                    <span className="uppercase tracking-wide">Recherche</span>
                    <input
                      type="search"
                      value={searchDraft}
                      onChange={(event) => setSearchDraft(event.target.value)}
                      placeholder="Titre, description, #id"
                      className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                    />
                    <span className="text-[10px] text-muted">Min. 3 caractères</span>
                  </label>
                  <fieldset className="flex flex-col gap-2 text-muted">
                    <legend className="text-[10px] uppercase tracking-wide">Assignés</legend>
                    <div className="flex flex-wrap gap-2">
                      <label className={`flex items-center gap-2 rounded-full border px-3 py-1 transition ${selectedAssignees.includes(UNASSIGNED_TOKEN) ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}>
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={selectedAssignees.includes(UNASSIGNED_TOKEN)}
                          onChange={() => toggleAssignee(UNASSIGNED_TOKEN)}
                        />
                        Aucun
                      </label>
                      {allAssignees.length === 0 && (
                        <span className="rounded-full border border-dashed border-white/15 px-3 py-1 text-muted">Aucun utilisateur assigné</span>
                      )}
                      {allAssignees.map((assignee) => (
                        <label
                          key={assignee.id}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1 transition ${selectedAssignees.includes(assignee.id) ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-accent"
                            checked={selectedAssignees.includes(assignee.id)}
                            onChange={() => toggleAssignee(assignee.id)}
                          />
                          {assignee.displayName}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="flex flex-col gap-2 text-muted">
                    <legend className="text-[10px] uppercase tracking-wide">Priorité</legend>
                    <div className="flex flex-wrap gap-2">
                      {PRIORITY_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1 transition ${selectedPriorities.includes(option.value) ? 'border-accent bg-accent/10 text-foreground' : 'border-white/15 text-muted hover:border-accent hover:text-foreground'}`}
                        >
                          <input
                            type="checkbox"
                            className="accent-accent"
                            checked={selectedPriorities.includes(option.value)}
                            onChange={() => togglePriority(option.value)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-muted">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-accent" checked={sortPriority} onChange={(event) => setSortPriority(event.target.checked)} />
                    Tri priorité (CRITICAL → NONE)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="accent-accent" checked={sortDueDate} onChange={(event) => setSortDueDate(event.target.checked)} />
                    Tri échéance (plus proche en premier)
                  </label>
                </div>
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
            {displayedColumns && displayedColumns.length>0 ? (
              <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <ColumnList
                  columns={displayedColumns}
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
                  onRequestMoveCard={handleRequestMoveCard}
                  onRequestDeleteCard={handleRequestDeleteCard}
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
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
            <h2 id="delete-dialog-title" className="text-lg font-semibold">Supprimer «{deleteTarget.title}» ?</h2>
            <p className="mt-2 text-sm text-muted">
              Confirmez la suppression de cette carte. La prévisualisation ci-dessous estime l’impact sur les sous-tâches.
            </p>
            {deleteLoading && (
              <p className="mt-4 text-sm text-accent">Analyse en cours…</p>
            )}
            {deletePreview && (
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  <span className="font-semibold">Enfants directs :</span> {deletePreview.directChildren}
                </p>
                <p>
                  <span className="font-semibold">Total descendants :</span> {deletePreview.totalDescendants}
                </p>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-[12px] font-mono text-muted">
                  <p className="sr-only">Ordre: Backlog, En cours, Bloqué, Fait.</p>
                  <span className="text-amber-300">{deletePreview.counts.backlog}</span>
                  <span className="text-muted">.</span>
                  <span className="text-sky-300">{deletePreview.counts.inProgress}</span>
                  <span className="text-muted">.</span>
                  <span className="text-rose-300">{deletePreview.counts.blocked}</span>
                  <span className="text-muted">.</span>
                  <span className="text-emerald-300">{deletePreview.counts.done}</span>
                </div>
              </div>
            )}
            {deleteError && (
              <p className="mt-3 text-sm text-rose-300">{deleteError}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteDialog}
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={deleteLoading || deleteSubmitting !== null || (deletePreview?.hasChildren ?? false)}
                title={deletePreview?.hasChildren ? 'Des sous-tâches existent : utilisez la suppression récursive.' : undefined}
                onClick={() => confirmDelete(false)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${deletePreview?.hasChildren ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted' : 'border border-white/15 bg-white/5 text-foreground hover:border-accent'} ${deleteSubmitting === 'single' ? 'opacity-60' : ''}`}
              >
                {deleteSubmitting === 'single' ? 'Suppression…' : 'Supprimer la carte'}
              </button>
              <button
                type="button"
                disabled={deleteLoading || deleteSubmitting !== null}
                onClick={() => confirmDelete(true)}
                className={`rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-200 hover:text-rose-100 ${deleteSubmitting === 'recursive' ? 'opacity-60' : ''}`}
              >
                {deleteSubmitting === 'recursive' ? 'Suppression…' : 'Supprimer tout (cascade)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamBoardPage;
