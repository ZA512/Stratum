"use client";

import React, { useMemo } from 'react';
import type { ArchivedBoardNode, ColumnBehaviorKey } from '@/features/boards/boards-api';

interface ArchivedCardsDialogProps {
  open: boolean;
  columnName: string;
  columnBehavior: ColumnBehaviorKey;
  nodes: ArchivedBoardNode[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRestore: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  submittingNodeId: string | null;
  submittingAction: 'restore' | 'delete' | null;
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('fr-FR', DATE_FORMAT_OPTIONS);
};

export function ArchivedCardsDialog({
  open,
  columnName,
  columnBehavior,
  nodes,
  loading,
  error,
  onClose,
  onRestore,
  onDelete,
  submittingNodeId,
  submittingAction,
}: ArchivedCardsDialogProps) {
  const archivedCountLabel = useMemo(() => {
    if (nodes.length === 0) {
      return 'Aucune carte archivée';
    }
    if (nodes.length === 1) {
      return '1 carte archivée';
    }
    return `${nodes.length} cartes archivées`;
  }, [nodes.length]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8"
      style={{ background: 'color-mix(in srgb, var(--color-overlay) 68%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="archived-dialog-title"
    >
      <div className="app-panel-strong w-full max-w-3xl rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="archived-dialog-title" className="text-lg font-semibold">
              Archives — {columnName}
            </h2>
            <p className="text-sm text-muted">
              {archivedCountLabel} ({columnBehavior.toLowerCase()})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="app-pill rounded-full px-3 py-1 text-sm text-muted transition hover:text-foreground"
          >
            Fermer
          </button>
        </div>

        <div className="app-toolbar mt-4 max-h-[60vh] overflow-y-auto rounded-2xl p-4">
          {loading && (
            <p className="text-sm text-muted">Chargement des cartes archivées…</p>
          )}
          {!loading && error && (
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
          )}
          {!loading && !error && nodes.length === 0 && (
            <p className="text-sm text-muted">
              Cette colonne ne contient actuellement aucune carte archivée.
            </p>
          )}
          {!loading && !error && nodes.length > 0 && (
            <ul className="space-y-3">
              {nodes.map((node) => {
                const restoring = submittingNodeId === node.id && submittingAction === 'restore';
                const deleting = submittingNodeId === node.id && submittingAction === 'delete';
                return (
                  <li
                    key={node.id}
                    className="app-panel flex items-start justify-between gap-4 rounded-xl p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {node.shortId ? `#${node.shortId} ` : ''}
                        {node.title}
                      </p>
                      <p className="text-xs text-muted">
                        Archivée le {formatDate(node.archivedAt)}
                      </p>
                      {node.dueAt && (
                        <p className="text-xs text-muted">Échéance: {formatDate(node.dueAt)}</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRestore(node.id)}
                        disabled={restoring || deleting}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                          restoring
                            ? 'cursor-wait'
                            : ''
                        }`}
                        style={restoring ? { background: 'var(--color-success-soft)', borderColor: 'color-mix(in srgb, var(--color-success) 42%, transparent)', color: 'var(--color-success)' } : { background: 'color-mix(in srgb, var(--color-success) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--color-success) 36%, transparent)', color: 'var(--color-success)' }}
                      >
                        {restoring ? 'Restauration…' : 'Restaurer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(node.id)}
                        disabled={restoring || deleting}
                        className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
                          deleting
                            ? 'cursor-wait'
                            : ''
                        }`}
                        style={deleting ? { background: 'var(--color-danger-soft)', borderColor: 'color-mix(in srgb, var(--color-danger) 42%, transparent)', color: 'var(--color-danger)' } : { background: 'color-mix(in srgb, var(--color-danger) 12%, transparent)', borderColor: 'color-mix(in srgb, var(--color-danger) 36%, transparent)', color: 'var(--color-danger)' }}
                      >
                        {deleting ? 'Suppression…' : 'Supprimer'}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
