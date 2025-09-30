"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth/auth-provider';
import {
  fetchBoardDetail,
  fetchChildBoards,
  fetchRootBoard,
  type BoardColumn,
  type BoardNode,
} from '@/features/boards/boards-api';
import { moveNodeToBoard } from '@/features/nodes/nodes-api';
import { useToast } from '@/components/toast/ToastProvider';

interface MoveCardDialogProps {
  teamId: string;
  node: BoardNode;
  currentBoardId: string;
  onClose: () => void;
  onSuccess: (payload: { boardId: string; boardName: string }) => Promise<void> | void;
}

type BoardOption = {
  boardId: string;
  nodeId: string;
  name: string;
  depth: number;
};

export function MoveCardDialog({
  teamId,
  node,
  currentBoardId,
  onClose,
  onSuccess,
}: MoveCardDialogProps) {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();

  const [boardOptions, setBoardOptions] = useState<BoardOption[]>([]);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState<string | null>(null);

  const [selectedBoardId, setSelectedBoardId] = useState<string>(currentBoardId);
  const [columnsMap, setColumnsMap] = useState<Record<string, BoardColumn[]>>({});
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setBoardLoading(false);
      setBoardError('Session invalide — veuillez vous reconnecter.');
      return;
    }

    let cancelled = false;
    setBoardLoading(true);
    setBoardError(null);

    (async () => {
      try {
        const root = await fetchRootBoard(teamId, accessToken);
        if (cancelled) return;

        const collected: BoardOption[] = [];
        const visited = new Set<string>();

        const traverse = async (
          option: { boardId: string; nodeId: string; name: string },
          depth: number,
        ) => {
          if (visited.has(option.nodeId)) return;
          visited.add(option.nodeId);
          collected.push({ ...option, depth });
          const children = await fetchChildBoards(option.nodeId, accessToken);
          for (const child of children) {
            await traverse(child, depth + 1);
          }
        };

        await traverse(
          { boardId: root.id, nodeId: root.nodeId, name: root.name },
          0,
        );

        if (!cancelled) {
          setBoardOptions(collected);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setBoardError(message || 'Impossible de charger la liste des kanbans.');
        }
      } finally {
        if (!cancelled) setBoardLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId, accessToken]);

  const selectedBoard = useMemo(
    () => boardOptions.find((option) => option.boardId === selectedBoardId) || null,
    [boardOptions, selectedBoardId],
  );

  useEffect(() => {
    if (!boardOptions.length) return;
    if (!boardOptions.some((option) => option.boardId === selectedBoardId)) {
      const fallback = boardOptions[0];
      if (fallback) setSelectedBoardId(fallback.boardId);
    }
  }, [boardOptions, selectedBoardId]);

  const selectedColumns = selectedBoardId ? columnsMap[selectedBoardId] : undefined;

  useEffect(() => {
    if (!selectedBoardId || !accessToken) return;

    if (selectedColumns) {
      setSelectedColumnId((prev) => {
        if (prev && selectedColumns.some((column) => column.id === prev)) {
          return prev;
        }
        if (selectedBoardId === currentBoardId && node.columnId) {
          const existing = selectedColumns.find((column) => column.id === node.columnId);
          if (existing) return existing.id;
        }
        return selectedColumns[0]?.id ?? null;
      });
      return;
    }

    let cancelled = false;
    setColumnsLoading(true);
    setColumnsError(null);

    (async () => {
      try {
        const detail = await fetchBoardDetail(selectedBoardId, accessToken);
        if (cancelled) return;
        setColumnsMap((prev) => ({ ...prev, [selectedBoardId]: detail.columns }));
        setSelectedColumnId((prev) => {
          if (prev && detail.columns.some((column) => column.id === prev)) {
            return prev;
          }
          if (selectedBoardId === currentBoardId && node.columnId) {
            const existing = detail.columns.find((column) => column.id === node.columnId);
            if (existing) return existing.id;
          }
          return detail.columns[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setColumnsError(message || 'Impossible de charger les colonnes.');
        }
      } finally {
        if (!cancelled) setColumnsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedBoardId,
    accessToken,
    selectedColumns,
    currentBoardId,
    node.columnId,
  ]);

  const handleConfirm = async () => {
    if (!accessToken) {
      setFormError('Session invalide – veuillez vous reconnecter.');
      return;
    }
    if (!selectedBoardId || !selectedColumnId) {
      setFormError('Sélectionnez un kanban et une colonne.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      await moveNodeToBoard(
        node.id,
        { targetBoardId: selectedBoardId, targetColumnId: selectedColumnId },
        accessToken,
      );
      const boardName = selectedBoard?.name ?? 'Kanban';
      success(`«${node.title}» a été déplacée vers «${boardName}».`);
      await onSuccess({ boardId: selectedBoardId, boardName });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de déplacer la tâche.';
      setFormError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const disableConfirm =
    submitting ||
    boardLoading ||
    columnsLoading ||
    !selectedBoardId ||
    !selectedColumnId ||
    !!boardError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-dialog-title"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
        <h2 id="move-dialog-title" className="text-lg font-semibold">
          Déplacer «{node.title}» dans un autre kanban
        </h2>
        <p className="mt-2 text-sm text-muted">
          Sélectionnez le kanban cible puis choisissez la colonne d&apos;arrivée. Le déplacement mettra à jour la progression du
          parent source et du parent cible.
        </p>

        {boardLoading ? (
          <p className="mt-6 text-sm text-accent">Chargement des kanbans disponibles…</p>
        ) : boardError ? (
          <p className="mt-6 text-sm text-rose-300">{boardError}</p>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Kanbans disponibles</p>
              <ul className="mt-3 space-y-1 max-h-64 overflow-y-auto pr-1">
                {boardOptions.map((option) => {
                  const isSelected = option.boardId === selectedBoardId;
                  return (
                    <li key={option.boardId}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBoardId(option.boardId);
                          setColumnsError(null);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg py-2 pr-3 text-left text-sm transition ${
                          isSelected
                            ? 'bg-white/10 text-foreground'
                            : 'text-muted hover:bg-white/5 hover:text-foreground'
                        }`}
                        style={{ paddingLeft: `${16 + option.depth * 12}px` }}
                      >
                        <span className="truncate">{option.name}</span>
                        {option.boardId === currentBoardId && (
                          <span className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                            Actuel
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Colonne d&apos;arrivée</p>
              {columnsLoading ? (
                <p className="mt-3 text-sm text-accent">Chargement des colonnes…</p>
              ) : selectedBoardId ? (
                selectedColumns && selectedColumns.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {selectedColumns.map((column) => {
                      const isSelected = column.id === selectedColumnId;
                      return (
                        <li key={column.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedColumnId(column.id)}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? 'border-accent bg-accent/10 text-foreground'
                                : 'border-white/10 text-muted hover:border-accent/60 hover:text-foreground'
                            }`}
                          >
                            <span className="truncate">{column.name}</span>
                            <span className="ml-3 text-[11px] uppercase tracking-wide text-muted">
                              {column.behaviorKey}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted">
                    Ce kanban ne contient pas encore de colonne. Créez une colonne avant d&apos;y déplacer une tâche.
                  </p>
                )
              ) : (
                <p className="mt-3 text-sm text-muted">Sélectionnez un kanban pour afficher ses colonnes.</p>
              )}
              {columnsError && (
                <p className="mt-3 text-sm text-rose-300">{columnsError}</p>
              )}
            </div>
          </div>
        )}

        {formError && !boardError && (
          <p className="mt-4 text-sm text-rose-300">{formError}</p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent hover:text-foreground"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={disableConfirm}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              disableConfirm
                ? 'cursor-not-allowed border-white/10 bg-white/5 text-muted'
                : 'border-accent/60 bg-accent/20 text-foreground hover:border-accent hover:bg-accent/30'
            }`}
          >
            {submitting ? 'Déplacement…' : 'Déplacer la tâche'}
          </button>
        </div>
      </div>
    </div>
  );
}
