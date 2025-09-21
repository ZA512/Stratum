"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createBoardColumn,
  deleteBoardColumn,
  fetchBoardDetail,
  fetchChildBoards,
  fetchNodeBreadcrumb,
  fetchRootBoard,
  updateBoardColumn,
  type Board,
  type BoardColumn,
  type BoardNode,
  type ColumnBehaviorKey,
  type NodeBreadcrumbItem,
  type NodeChildBoard,
  type UpdateBoardColumnInput,
} from "@/features/boards/boards-api";
import { FractalBreadcrumb } from "@/components/fractal-breadcrumb";
import { convertNode, createNode } from "@/features/nodes/nodes-api";

type ChildBoardMap = Record<string, NodeChildBoard>;

type BehaviorOption = {
  value: ColumnBehaviorKey;
  label: string;
};

const BEHAVIOR_OPTIONS: BehaviorOption[] = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "BLOCKED", label: "Bloqué" },
  { value: "DONE", label: "Terminé" },
  { value: "CUSTOM", label: "Custom" },
];

const BEHAVIOR_LABELS = Object.fromEntries(
  BEHAVIOR_OPTIONS.map((option) => [option.value, option.label] as const),
) as Record<ColumnBehaviorKey, string>;

const NODE_CONVERSION_TARGETS: Record<BoardNode["type"], Array<{ value: BoardNode["type"]; label: string }>> = {
  SIMPLE: [
    { value: "MEDIUM", label: "Vers tache moyenne" },
    { value: "COMPLEX", label: "Vers sous-board" },
  ],
  MEDIUM: [
    { value: "SIMPLE", label: "Vers tache simple" },
    { value: "COMPLEX", label: "Vers sous-board" },
  ],
  COMPLEX: [{ value: "SIMPLE", label: "Vers tache simple" }],
};

export default function TeamBoardPage() {
  const params = useParams<{ teamId: string; board?: string[] }>();
  const router = useRouter();
  const { user, accessToken, initializing, logout } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState<NodeBreadcrumbItem[]>([]);
  const [loadingBreadcrumb, setLoadingBreadcrumb] = useState(false);
  const [childBoards, setChildBoards] = useState<ChildBoardMap>({});
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [columnName, setColumnName] = useState("");
  const [columnBehavior, setColumnBehavior] = useState<ColumnBehaviorKey>("BACKLOG");
  const [columnWip, setColumnWip] = useState("");
  const [columnError, setColumnError] = useState<string | null>(null);
  const [columnSubmitting, setColumnSubmitting] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingWip, setEditingWip] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const [convertingNodeId, setConvertingNodeId] = useState<string | null>(null);
  // Caches pour navigation fluide (évite le clignotement sur descente)
  const cachesRef = useRef<{
    boards: Map<string, Board>;
    breadcrumbs: Map<string, NodeBreadcrumbItem[]>;
    childBoards: Map<string, ChildBoardMap>;
  }>({ boards: new Map(), breadcrumbs: new Map(), childBoards: new Map() });
  const descendTriggerRef = useRef<((href: string) => void) | null>(null);
  const [navigatingDown, setNavigatingDown] = useState(false);

  const teamId = params?.teamId;
  const boardIdParam = useMemo(() => {
    if (!params?.board || params.board.length === 0) {
      return undefined;
    }
    return params.board[0];
  }, [params]);

  useEffect(() => {
    if (!initializing && !user) {
      router.replace("/login");
    }
  }, [initializing, user, router]);

  useEffect(() => {
    // NOTE: Les endpoints fetchRootBoard et fetchBoardDetail ne sont pas protégés par JwtAuthGuard.
    // On ne bloque donc plus sur accessToken pour afficher rapidement le board root.
    // Cela évite l'état vide "Aucun board trouvé" quand le token n'est pas encore initialisé.
    if (!teamId) {
      return;
    }

    let active = true;

    async function loadBoard() {
      try {
        setLoading(true);
        setDetailLoading(true);
        setError(null);

        let targetBoardId: string | undefined = boardIdParam ?? undefined;
        if (!targetBoardId) {
          const root = await fetchRootBoard(teamId as string, accessToken as string);
          if (!active) return;
          targetBoardId = root.id;
        }
  if (!targetBoardId) return;
  // targetBoardId et accessToken sont non-null à ce stade
  const detail = await fetchBoardDetail(targetBoardId as string, accessToken as string);
        if (!active) return;
        setBoard(detail);
      } catch (err) {
        if (active) {
          setError((err as Error).message);
        }
      } finally {
        if (active) {
          setLoading(false);
          setDetailLoading(false);
        }
      }
    }

    loadBoard();

    return () => {
      active = false;
    };
  }, [teamId, accessToken, boardIdParam]);

  useEffect(() => {
    if (!board || !board.nodeId || !accessToken) {
      return;
    }
    const nodeId = board.nodeId;

    let active = true;

    async function loadBreadcrumb() {
      try {
    setLoadingBreadcrumb(true);
  const items = await fetchNodeBreadcrumb(nodeId as string, accessToken as string);
        if (!active) {
          return;
        }
        setBreadcrumb(items);
      } catch (err) {
        if (active) {
          console.warn("Unable to load breadcrumb", err);
        }
      } finally {
        if (active) {
          setLoadingBreadcrumb(false);
        }
      }
    }

    async function loadChildBoards() {
      try {
  const entries = await fetchChildBoards(nodeId as string, accessToken as string);
        if (!active) {
          return;
        }
        const nextMap: ChildBoardMap = {};
        for (const entry of entries) {
          nextMap[entry.nodeId] = entry;
        }
        setChildBoards(nextMap);
      } catch (err) {
        if (active) {
          console.warn("Unable to load child boards", err);
        }
      }
    }

    loadBreadcrumb();
    loadChildBoards();

    return () => {
      active = false;
    };
  }, [board?.nodeId, accessToken]);

  useEffect(() => {
    if (!editingColumnId) {
      return;
    }

    if (!board?.columns.some((col) => col.id === editingColumnId)) {
      setEditingColumnId(null);
      setEditingError(null);
      setEditingSubmitting(false);
    }
  }, [board?.columns, editingColumnId]);

  const refreshBoardDetail = useCallback(
    async (targetBoardId?: string) => {
      if (!accessToken) {
        throw new Error("Session invalide. Merci de vous reconnecter.");
      }

      const resolvedBoardId = targetBoardId ?? board?.id;
      if (!resolvedBoardId) {
        return;
      }

      setDetailLoading(true);
      try {
        const detail = await fetchBoardDetail(resolvedBoardId, accessToken);
        setBoard(detail);
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken, board?.id],
  );

  const prefetchBoardData = useCallback(async (targetBoardId: string) => {
    if (!accessToken) return;
    // Ne refetch pas si déjà en cache
    if (cachesRef.current.boards.has(targetBoardId)) return;
    try {
      const detailPromise = fetchBoardDetail(targetBoardId, accessToken);
      const detail = await detailPromise;
      cachesRef.current.boards.set(targetBoardId, detail);
      if (detail.nodeId) {
        const [breadcrumbItems, childEntries] = await Promise.all([
          fetchNodeBreadcrumb(detail.nodeId, accessToken),
          fetchChildBoards(detail.nodeId, accessToken),
        ]);
        cachesRef.current.breadcrumbs.set(detail.nodeId, breadcrumbItems);
        const map: ChildBoardMap = {};
        for (const entry of childEntries) map[entry.nodeId] = entry;
        cachesRef.current.childBoards.set(detail.nodeId, map);
      }
    } catch {
      // silencieux
    }
  }, [accessToken]);

  const handleOpenChildBoard = useCallback((childBoardId: string) => {
    if (!teamId || !accessToken || !childBoardId || navigatingDown) return;
    if (board?.id === childBoardId) return;
    setNavigatingDown(true);
    // Pré-charge les données
    prefetchBoardData(childBoardId);
    const href = `/boards/${teamId}/${childBoardId}`;
    // Préfetch Next.js route
    try { router.prefetch(href); } catch {}
    if (descendTriggerRef.current) {
      descendTriggerRef.current(href);
    } else {
      router.push(href);
    }
    // Sécurité pour réactiver si quelque chose échoue
    setTimeout(() => setNavigatingDown(false), 4000);
  }, [accessToken, board?.id, navigatingDown, prefetchBoardData, router, teamId]);

  const handleSelectBreadcrumb = (nodeId: string) => {
    if (!teamId) {
      return;
    }

    const item = breadcrumb.find((entry) => entry.id === nodeId);
    if (!item) {
      return;
    }

    if (item.boardId) {
      if (board?.id !== item.boardId) {
        // Remontée (animation déjà gérée dans le breadcrumb). Navigation classique.
        router.push(`/boards/${teamId}/${item.boardId}`);
      }
      return;
    }

    if (nodeId === breadcrumb[breadcrumb.length - 1]?.id) {
      return;
    }

    router.push(`/boards/${teamId}`);
  };

  const resetColumnForm = () => {
    setColumnName("");
    setColumnBehavior("BACKLOG");
    setColumnWip("");
    setColumnError(null);
  };

  const handleSubmitColumn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !board) {
      setColumnError("Session invalide. Merci de vous reconnecter.");
      return;
    }

    if (!columnName.trim()) {
      setColumnError("Le nom de colonne est obligatoire");
      return;
    }

    const payload: {
      name: string;
      behaviorKey: ColumnBehaviorKey;
      wipLimit?: number;
    } = {
      name: columnName.trim(),
      behaviorKey: columnBehavior,
    };

    if (columnWip.trim()) {
      const parsed = Number.parseInt(columnWip.trim(), 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setColumnError("Le WIP doit etre un entier positif");
        return;
      }
      payload.wipLimit = parsed;
    }

    setColumnSubmitting(true);
    setColumnError(null);

    try {
      await createBoardColumn(board.id, payload, accessToken);
      await refreshBoardDetail(board.id);
      setIsAddingColumn(false);
      resetColumnForm();
    } catch (err) {
      setColumnError((err as Error).message);
    } finally {
      setColumnSubmitting(false);
    }
  };


  const handleCreateCard = useCallback(
    async (columnId: string, title: string) => {
      if (!accessToken || !board) {
        throw new Error("Session invalide. Merci de vous reconnecter.");
      }

      await createNode({ title, columnId }, accessToken);
      await refreshBoardDetail(board.id);
    },
    [accessToken, board, refreshBoardDetail],
  );

  const handleConvertNode = useCallback(
    async (
      nodeId: string,
      targetType: BoardNode['type'],
      options?: { checklistItems?: string[] },
    ) => {
      if (!accessToken || !board) {
        const message = 'Session invalide. Merci de vous reconnecter.';
        setError(message);
        throw new Error(message);
      }

      setConvertingNodeId(nodeId);
      try {
        await convertNode(
          nodeId,
          {
            targetType,
            ...(options?.checklistItems?.length ? { checklistItems: options.checklistItems } : {}),
          },
          accessToken,
        );
        await refreshBoardDetail(board.id);
      } catch (err) {
        const message = (err as Error).message;
        setError(message);
        throw err;
      } finally {
        setConvertingNodeId(null);
      }
    },
    [accessToken, board, refreshBoardDetail],
  );

  const handleOpenColumnEditor = (column: BoardColumn) => {
    setEditingColumnId(column.id);
    setEditingName(column.name);
    setEditingWip(column.wipLimit ? String(column.wipLimit) : "");
    setEditingError(null);
    setEditingSubmitting(false);
  };

  const handleCancelEditColumn = () => {
    setEditingColumnId(null);
    setEditingError(null);
    setEditingSubmitting(false);
  };

  const handleUpdateColumn = async (
    event: FormEvent<HTMLFormElement>,
    column: BoardColumn,
  ) => {
    event.preventDefault();

    if (!accessToken || !board) {
      setEditingError("Session invalide. Merci de vous reconnecter.");
      return;
    }

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setEditingError("Le nom de la colonne est obligatoire");
      return;
    }

    const updates: UpdateBoardColumnInput = {};
    if (trimmedName !== column.name) {
      updates.name = trimmedName;
    }

    const wipValue = editingWip.trim();
    if (wipValue === "") {
      if (column.wipLimit !== null) {
        updates.wipLimit = null;
      }
    } else {
      const parsed = Number.parseInt(wipValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setEditingError("Le WIP doit etre un entier positif");
        return;
      }
      if (column.wipLimit !== parsed) {
        updates.wipLimit = parsed;
      }
    }

    if (Object.keys(updates).length === 0) {
      setEditingColumnId(null);
      return;
    }

    setEditingSubmitting(true);
    setEditingError(null);

    try {
      await updateBoardColumn(board.id, column.id, updates, accessToken);
      await refreshBoardDetail(board.id);
      setEditingColumnId(null);
    } catch (err) {
      setEditingError((err as Error).message);
    } finally {
      setEditingSubmitting(false);
    }
  };

  const handleMoveColumn = async (
    column: BoardColumn,
    direction: -1 | 1,
    currentIndex: number,
  ) => {
    if (!accessToken || !board) {
      setEditingError("Session invalide. Merci de vous reconnecter.");
      return;
    }

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= board.columns.length) {
      return;
    }

    setEditingSubmitting(true);
    setEditingError(null);

    try {
      await updateBoardColumn(board.id, column.id, { position: targetIndex }, accessToken);
      await refreshBoardDetail(board.id);
    } catch (err) {
      setEditingError((err as Error).message);
    } finally {
      setEditingSubmitting(false);
    }
  };

  const handleDeleteColumn = async (column: BoardColumn) => {
    if (!accessToken || !board) {
      setEditingError("Session invalide. Merci de vous reconnecter.");
      return;
    }

    if (!window.confirm(`Supprimer la colonne "${column.name}" ?`)) {
      return;
    }

    setEditingSubmitting(true);
    setEditingError(null);

    try {
      await deleteBoardColumn(board.id, column.id, accessToken);
      await refreshBoardDetail(board.id);
      setEditingColumnId(null);
    } catch (err) {
      setEditingError((err as Error).message);
    } finally {
      setEditingSubmitting(false);
    }
  };




  // Hydrate à partir du cache si possible (évite flash de chargement) quand boardIdParam change
  useEffect(() => {
    if (!accessToken) return;
    if (!boardIdParam) return;
    // Si déjà dans cache et différent de board state actuel
    const cached = cachesRef.current.boards.get(boardIdParam);
    if (cached && cached.id !== board?.id) {
      setBoard(cached);
      if (cached.nodeId) {
        const bc = cachesRef.current.breadcrumbs.get(cached.nodeId);
        if (bc) setBreadcrumb(bc);
        const ch = cachesRef.current.childBoards.get(cached.nodeId);
        if (ch) setChildBoards(ch);
      }
      setLoading(false);
      setDetailLoading(false);
    }
  }, [accessToken, board?.id, boardIdParam]);

  return (
    <FractalBreadcrumb
      items={breadcrumb}
      onSelect={handleSelectBreadcrumb}
      offsetX={56}
      offsetY={40}
      labelWidth={220}
      visibleTrailingCount={8}
      registerDescend={(fn) => { descendTriggerRef.current = fn; }}
    >
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-white/10 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">

          <div className="space-y-1">

            <p className="text-xs uppercase tracking-[0.35em] text-accent">Stratum</p>

            <h1 className="text-3xl font-semibold leading-tight">

              {board ? board.name : "Board"}

            </h1>

          </div>

          <div className="flex items-center gap-3">

            <div className="text-right">

              <p className="text-sm font-semibold">{user?.displayName}</p>

              <p className="text-[11px] uppercase tracking-[0.35em] text-muted">Équipe {teamId}</p>

            </div>

            <button

              type="button"

              onClick={logout}

              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"

            >

              Déconnexion

            </button>

          </div>

        </div>

      </header>



      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">

        <section className="grid gap-6">

          <div className="rounded-2xl border border-white/10 bg-card/70 p-6">

            <div className="flex items-center justify-between gap-4">

              <div>

                <h2 className="text-lg font-semibold">Colonnes</h2>

                <p className="text-sm text-muted">Ajoutez des colonnes pour structurer votre board.</p>

              </div>

              {!isAddingColumn ? (

                <button

                  type="button"

                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:bg-accent-strong"

                  onClick={() => {

                    setIsAddingColumn(true);

                    setColumnError(null);

                  }}

                >

                  Nouvelle colonne

                </button>

              ) : null}

            </div>



            {isAddingColumn ? (

              <form onSubmit={handleSubmitColumn} className="mt-5 grid gap-4 md:grid-cols-2">

                <label className="text-xs text-muted">

                  Nom

                  <input

                    type="text"

                    value={columnName}

                    onChange={(event) => setColumnName(event.target.value)}

                    placeholder="Studio design"

                    className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"

                    required

                  />

                </label>



                <label className="text-xs text-muted">

                  Comportement

                  <select

                    value={columnBehavior}

                    onChange={(event) => setColumnBehavior(event.target.value as ColumnBehaviorKey)}

                    className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"

                  >

                    {BEHAVIOR_OPTIONS.map((option) => (

                      <option key={option.value} value={option.value}>

                        {option.label}

                      </option>

                    ))}

                  </select>

                </label>



                <label className="text-xs text-muted">

                  WIP (optionnel)

                  <input

                    type="number"

                    min="1"

                    value={columnWip}

                    onChange={(event) => setColumnWip(event.target.value)}

                    placeholder="Illimité"

                    className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"

                  />

                </label>



                <div className="flex items-center gap-3 pt-4">

                  <button

                    type="submit"

                    className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"

                    disabled={columnSubmitting}

                  >

                    {columnSubmitting ? "Création…" : "Créer"}

                  </button>

                  <button

                    type="button"

                    className="text-sm text-muted transition hover:text-foreground"

                    onClick={() => {

                      setIsAddingColumn(false);

                      resetColumnForm();

                    }}

                  >

                    Annuler

                  </button>

                </div>

                {columnError ? <p className="text-sm text-red-300">{columnError}</p> : null}

              </form>

            ) : null}

          </div>

        </section>



        {error ? (

          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-200">

            {error}

          </div>

        ) : null}



        {loading ? <BoardSkeleton /> : null}



        {!loading && board ? (

          <section className="space-y-4">

            <div className="flex items-baseline justify-between">

              <h2 className="text-xl font-semibold">Colonnes du board</h2>

              <span className="text-xs uppercase tracking-wide text-muted">

                {detailLoading

                  ? "Actualisation…"

                  : board.columns.length === 0

                  ? "Aucune colonne"

                  : `${board.columns.length} colonne(s)`}

              </span>

            </div>



            {board.columns.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto pb-2">
                {board.columns.map((column, index) => {
                  const isEditing = editingColumnId === column.id;
                  const isFirst = index === 0;
                  const isLast = index === board.columns.length - 1;

                  return (
                    <article
                      key={column.id}
                      className="min-w-[280px] max-w-[320px] shrink-0 rounded-2xl border border-white/10 bg-card/80 p-5 shadow-lg shadow-black/30"
                    >
                      <header className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold">{column.name}</h3>
                          <p className="text-[11px] uppercase tracking-wide text-muted">
                            {BEHAVIOR_LABELS[column.behaviorKey as ColumnBehaviorKey] ?? column.behaviorKey}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className="rounded-full border border-white/10 bg-surface/70 px-3 py-1 text-[11px] uppercase tracking-wide text-muted"
                            title={
                              typeof column.wipLimit === "number"
                                ? `Limite WIP ${column.wipLimit}`
                                : "Pas de limite WIP"
                            }
                          >
                            {typeof column.wipLimit === "number" ? `WIP ${column.wipLimit}` : "∞"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              isEditing ? handleCancelEditColumn() : handleOpenColumnEditor(column)
                            }
                            className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60"
                            disabled={editingSubmitting && !isEditing}
                          >
                            {isEditing ? "Fermer" : "Gérer"}
                          </button>
                        </div>
                      </header>

                      {isEditing ? (
                        <form
                          onSubmit={(event) => handleUpdateColumn(event, column)}
                          className="mt-4 space-y-3 rounded-xl border border-white/10 bg-surface/60 p-4"
                        >
                          <label className="text-xs text-muted">
                            Nom
                            <input
                              type="text"
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                              className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                              disabled={editingSubmitting}
                            />
                          </label>
                          <label className="text-xs text-muted">
                            Limite WIP
                            <input
                              type="text"
                              value={editingWip}
                              onChange={(event) => setEditingWip(event.target.value)}
                              placeholder="Illimité"
                              className="mt-1 w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                              disabled={editingSubmitting}
                            />
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="submit"
                              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"
                              disabled={editingSubmitting}
                            >
                              Enregistrer
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelEditColumn}
                              className="text-xs text-muted transition hover:text-foreground disabled:opacity-60"
                              disabled={editingSubmitting}
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveColumn(column, -1, index)}
                              className="ml-auto rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60"
                              disabled={editingSubmitting || isFirst}
                            >
                              Déplacer gauche
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveColumn(column, 1, index)}
                              className="rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-wide text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60"
                              disabled={editingSubmitting || isLast}
                            >
                              Déplacer droite
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteColumn(column)}
                              className="rounded-full border border-red-500/40 px-3 py-1 text-[11px] uppercase tracking-wide text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:opacity-60"
                              disabled={editingSubmitting}
                            >
                              Supprimer
                            </button>
                          </div>
                          {editingError ? (
                            <p className="text-xs text-red-300">{editingError}</p>
                          ) : null}
                        </form>
                      ) : null}

                      <div className="mt-4 space-y-3">
                        {(() => {
                          const cards = column.nodes ?? [];
                          if (cards.length === 0) {
                            return (
                              <p className="rounded-xl border border-dashed border-white/10 bg-surface/40 px-4 py-4 text-sm text-muted">
                                {detailLoading ? "Chargement des cartes." : "Aucune carte pour le moment"}
                              </p>
                            );
                          }
                          return cards.map((node) => (
                          <NodeCard
                            key={node.id}
                            node={node}
                            childBoard={childBoards[node.id]}
                            onOpenChildBoard={handleOpenChildBoard}
                            onConvert={(targetType, options) =>
                              handleConvertNode(node.id, targetType, options)
                            }
                            converting={convertingNodeId === node.id}
                          />
                        ));
                        })()}
                      </div>

                      <div className="mt-4 border-t border-white/10 pt-4">
                        <AddCardForm
                          columnId={column.id}
                          onCreate={(title) => handleCreateCard(column.id, title)}
                          disabled={detailLoading}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (

              <div className="rounded-2xl border border-dashed border-white/15 bg-card/60 p-8 text-center">

                <p className="text-sm text-muted">

                  Ce board n&apos;a pas encore de colonnes. Créez-en une pour organiser votre flux.

                </p>

                <button

                  type="button"

                  onClick={() => setIsAddingColumn(true)}

                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-background transition hover:bg-accent-strong"

                  disabled={isAddingColumn}

                >

                  Ajouter une colonne

                </button>

              </div>

            )}

          </section>

        ) : null}



        {!loading && !board && !error ? (

          <div className="rounded-2xl border border-dashed border-white/10 bg-card/60 p-8 text-center text-sm text-muted">

            Aucun board trouvé pour cette équipe.

          </div>

        ) : null}

      </main>

    </div>
    </FractalBreadcrumb>

  );

}



function BoardSkeleton() {

  return (

    <div className="flex gap-4 overflow-x-auto">

      {Array.from({ length: 4 }).map((_, index) => (

        <div key={index} className="min-w-[280px] animate-pulse rounded-2xl border border-white/10 bg-card/40 p-5">

          <div className="h-5 w-3/4 rounded bg-white/15" />

          <div className="mt-4 h-4 w-1/2 rounded bg-white/10" />

          <div className="mt-4 h-24 rounded-xl bg-white/5" />

        </div>

      ))}

    </div>

  );

}





function NodeCard(
  {
    node,
    childBoard,
    onOpenChildBoard,
    onConvert,
    converting,
  }: {
    node: BoardNode;
    childBoard?: NodeChildBoard;
    onOpenChildBoard: (boardId: string) => void;
    onConvert: (target: BoardNode['type'], options?: { checklistItems?: string[] }) => Promise<void>;
    converting: boolean;
  }) {
  const [conversionOpen, setConversionOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<BoardNode['type'] | null>(null);
  const [checklistInput, setChecklistInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const availableTargets = NODE_CONVERSION_TARGETS[node.type] ?? [];

  const toggleConversion = () => {
    setConversionOpen((prev) => !prev);
    setLocalError(null);
    if (conversionOpen) {
      setSelectedTarget(null);
      setChecklistInput('');
    }
  };

  const handleSelectTarget = (value: BoardNode['type']) => {
    setSelectedTarget(value);
    if (value !== 'MEDIUM') {
      setChecklistInput('');
    }
  };

  const handleSubmitConversion = async () => {
    if (!selectedTarget) {
      setLocalError('Selectionnez un type cible');
      return;
    }

    const checklistItems =
      selectedTarget === "MEDIUM"
        ? checklistInput
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter((item) => item.length > 0)
        : undefined;

    setLocalError(null);
    try {
      await onConvert(
        selectedTarget,
        checklistItems && checklistItems.length > 0 ? { checklistItems } : undefined,
      );
      setConversionOpen(false);
      setSelectedTarget(null);
      setChecklistInput('');
    } catch (err) {
      setLocalError((err as Error).message);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-surface/80 p-4 transition hover:border-accent/60">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium leading-tight">{node.title}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted">{node.type}</p>
          {node.dueAt ? (
            <p className="text-xs text-muted">Due {formatShortDate(node.dueAt)}</p>
          ) : null}
        </div>
        {availableTargets.length ? (
          <button
            type="button"
            onClick={toggleConversion}
            className="text-[11px] uppercase tracking-wide text-muted transition hover:text-foreground disabled:opacity-60"
            disabled={converting}
          >
            {conversionOpen ? 'Fermer' : 'Convertir'}
          </button>
        ) : null}
      </div>

      {childBoard ? (
        <button
          type="button"
          onClick={() => onOpenChildBoard(childBoard.boardId)}
          className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-accent transition hover:text-accent-strong"
        >
          Ouvrir le sous-board <span aria-hidden="true">-&gt;</span>
        </button>
      ) : null}

      {conversionOpen ? (
        <div className="mt-3 space-y-3 rounded-lg border border-white/10 bg-surface/70 p-3 text-xs">
          <p className="text-muted">Choisissez le type cible pour cette tache.</p>
          <div className="flex flex-wrap gap-2">
            {availableTargets.map((target) => {
              const isActive = selectedTarget === target.value;
              return (
                <button
                  key={target.value}
                  type="button"
                  onClick={() => handleSelectTarget(target.value)}
                  className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-wide transition ${
                    isActive
                      ? 'border-accent bg-accent/20 text-foreground'
                      : 'border-white/15 text-muted hover:border-accent hover:text-foreground'
                  }`}
                  disabled={converting}
                >
                  {target.label}
                </button>
              );
            })}
          </div>
          {selectedTarget === 'MEDIUM' ? (
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wide text-muted">Checklist (une ligne par element)</span>
              <textarea
                value={checklistInput}
                onChange={(event) => setChecklistInput(event.target.value)}
                placeholder="Configurer les etapes a suivre"
                className="h-20 w-full resize-none rounded-lg border border-white/10 bg-surface px-3 py-2 text-xs text-foreground outline-none transition focus:border-accent"
                disabled={converting}
              />
            </label>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmitConversion}
              className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"
              disabled={converting || !selectedTarget}
            >
              Valider
            </button>
            <button
              type="button"
              onClick={toggleConversion}
              className="text-[11px] text-muted transition hover:text-foreground disabled:opacity-60"
              disabled={converting}
            >
              Annuler
            </button>
            {converting ? (
              <span className="ml-auto text-[11px] uppercase tracking-wide text-muted">Conversion...</span>
            ) : null}
          </div>
          {localError ? <p className="text-xs text-red-300">{localError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function AddCardForm({

  columnId,

  onCreate,

  disabled,

}: {

  columnId: string;

  onCreate: (title: string) => Promise<void>;

  disabled: boolean;

}) {

  const [title, setTitle] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState<string | null>(null);



  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault();

    if (!title.trim()) {

      setError("Le titre est obligatoire");

      return;

    }



    setSubmitting(true);

    setError(null);



    try {

      await onCreate(title.trim());

      setTitle("");

    } catch (err) {

      setError((err as Error).message);

    } finally {

      setSubmitting(false);

    }

  };



  return (

    <form onSubmit={handleSubmit} className="space-y-2">

      <label className="block text-xs text-muted">

        <span className="sr-only">Titre de la carte pour la colonne {columnId}</span>

        <input

          type="text"

          value={title}

          onChange={(event) => setTitle(event.target.value)}

          placeholder="Nouvelle tâche"

          className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent"

          disabled={disabled || submitting}

        />

      </label>

      <div className="flex items-center justify-between gap-2">

        <button

          type="submit"

          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"

          disabled={disabled || submitting}

        >

          {submitting ? "Ajout…" : "Ajouter"}

        </button>

        {error ? <span className="text-xs text-red-300">{error}</span> : null}

      </div>

    </form>

  );

}



function formatShortDate(input: string) {

  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(input));

}















