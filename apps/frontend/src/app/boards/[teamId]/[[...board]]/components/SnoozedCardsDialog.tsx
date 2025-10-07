"use client";

import React, { useMemo } from 'react';
import type { ColumnBehaviorKey, BoardNode } from '@/features/boards/boards-api';

interface SnoozedCardsDialogProps {
  open: boolean;
  columnName: string;
  columnBehavior: ColumnBehaviorKey;
  nodes: BoardNode[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onUnsnooze: (nodeId: string) => void;
  submittingNodeId: string | null;
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

export function SnoozedCardsDialog({
  open,
  columnName,
  columnBehavior,
  nodes,
  loading,
  error,
  onClose,
  onUnsnooze,
  submittingNodeId,
}: SnoozedCardsDialogProps) {
  const snoozedCountLabel = useMemo(() => {
    if (nodes.length === 0) {
      return 'Aucune carte reportée';
    }
    if (nodes.length === 1) {
      return '1 carte reportée';
    }
    return `${nodes.length} cartes reportées`;
  }, [nodes.length]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="snoozed-dialog-title"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="snoozed-dialog-title" className="text-lg font-semibold">
              Cartes reportées — {columnName}
            </h2>
            <p className="text-sm text-muted">
              {snoozedCountLabel} ({columnBehavior.toLowerCase()})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-sm text-muted transition hover:border-accent hover:text-foreground"
          >
            Fermer
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          {loading && (
            <p className="text-sm text-muted">Chargement des cartes reportées…</p>
          )}
          {!loading && error && (
            <p className="text-sm text-rose-300">{error}</p>
          )}
          {!loading && !error && nodes.length === 0 && (
            <p className="text-sm text-muted">
              Cette colonne ne contient actuellement aucune carte reportée.
            </p>
          )}
          {!loading && !error && nodes.length > 0 && (
            <ul className="space-y-3">
              {nodes.map((node) => {
                const unsnoozing = submittingNodeId === node.id;
                return (
                  <li
                    key={node.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-surface/80 p-4"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {node.shortId ? `#${node.shortId} ` : ''}
                        {node.title}
                      </p>
                      <p className="text-xs text-cyan-300">
                        Reportée jusqu'au {formatDate(node.backlogHiddenUntil ?? null)}
                      </p>
                      {node.dueAt && (
                        <p className="text-xs text-muted">Échéance: {formatDate(node.dueAt)}</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUnsnooze(node.id)}
                        disabled={unsnoozing}
                        className={`rounded-full border border-cyan-400/40 px-3 py-1 text-sm font-semibold transition ${
                          unsnoozing
                            ? 'cursor-wait bg-cyan-500/20 text-cyan-100'
                            : 'bg-cyan-500/10 text-cyan-200 hover:border-cyan-200 hover:text-cyan-100'
                        }`}
                      >
                        {unsnoozing ? 'Réveiller…' : 'Réveiller'}
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
