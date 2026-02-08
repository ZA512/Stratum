"use client";

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast/ToastProvider';
import type { QuickNote } from './quick-notes-api';
import {
  executeQuickNoteAi,
  refineQuickNoteAi,
  suggestQuickNoteAi,
  type QuickNoteAiAction,
  type QuickNoteAiExecutionResult,
  type QuickNoteAiSuggestion,
} from './quick-notes-ai-api';

type QuickNoteAiPanelProps = {
  note: QuickNote;
  onClose: () => void;
};

export function QuickNoteAiPanel({ note, onClose }: QuickNoteAiPanelProps) {
  const queryClient = useQueryClient();
  const { success, error: toastError, warning } = useToast();
  const [suggestions, setSuggestions] = useState<QuickNoteAiSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [providerLabel, setProviderLabel] = useState<string>('—');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [executionResults, setExecutionResults] = useState<
    QuickNoteAiExecutionResult[]
  >([]);
  const [commentBySuggestion, setCommentBySuggestion] = useState<
    Record<string, string>
  >({});

  const suggestMutation = useMutation({
    mutationFn: (input: { instructions?: string }) =>
      suggestQuickNoteAi(note.id, {
        instructions: input.instructions,
        maxSuggestions: 3,
      }),
    onSuccess: (response) => {
      setSuggestions(response.suggestions);
      setSelectedSuggestionIds(response.suggestions.map((item) => item.id));
      setProviderLabel(`${response.provider} · ${response.model}`);
      setWarnings(response.warnings);
      setExecutionResults([]);
    },
    onError: (err) => {
      toastError(err instanceof Error ? err.message : 'Erreur IA');
    },
  });

  const refineMutation = useMutation({
    mutationFn: (input: { feedback: string; maxSuggestions?: number }) =>
      refineQuickNoteAi(note.id, {
        feedback: input.feedback,
        maxSuggestions: input.maxSuggestions ?? 3,
      }),
  });

  const executeMutation = useMutation({
    mutationFn: (input: { actions: QuickNoteAiAction[] }) =>
      executeQuickNoteAi(note.id, {
        actions: input.actions,
        treatQuickNoteOnSuccess: true,
      }),
    onSuccess: async (response) => {
      setExecutionResults(response.results);
      if (response.failed > 0) {
        warning(
          `${response.succeeded} action(s) exécutée(s), ${response.failed} en erreur`,
        );
      } else {
        success(`${response.succeeded} action(s) IA exécutée(s)`);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['quick-notes', 'open'] }),
        queryClient.invalidateQueries({ queryKey: ['board'] }),
      ]);

      if (response.failed === 0) {
        onClose();
      }
    },
    onError: (err) => {
      toastError(
        err instanceof Error
          ? err.message
          : "Impossible d'exécuter les actions IA",
      );
    },
  });

  useEffect(() => {
    setSuggestions([]);
    setSelectedSuggestionIds([]);
    setProviderLabel('—');
    setWarnings([]);
    setExecutionResults([]);
    setCommentBySuggestion({});
    suggestMutation.mutate({ instructions: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const selectedSuggestions = useMemo(
    () =>
      suggestions.filter((item) => selectedSuggestionIds.includes(item.id)),
    [suggestions, selectedSuggestionIds],
  );

  const selectedActions = useMemo(
    () => collectActions(selectedSuggestions),
    [selectedSuggestions],
  );

  const isLoading =
    suggestMutation.isPending || refineMutation.isPending || executeMutation.isPending;

  const hasCommentEdits = useMemo(
    () =>
      selectedSuggestions.some((suggestion) =>
        Boolean(commentBySuggestion[suggestion.id]?.trim()),
      ),
    [commentBySuggestion, selectedSuggestions],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const suggestion of suggestions) {
      if (commentBySuggestion[suggestion.id]) {
        next[suggestion.id] = commentBySuggestion[suggestion.id];
      }
    }
    const currentKeys = Object.keys(commentBySuggestion);
    const nextKeys = Object.keys(next);
    const sameLength = currentKeys.length === nextKeys.length;
    const sameValues = sameLength
      ? nextKeys.every((key) => next[key] === commentBySuggestion[key])
      : false;
    if (!sameValues) {
      setCommentBySuggestion(next);
      setExecutionResults([]);
    }
  }, [suggestions, commentBySuggestion]);

  const applySelection = (actions: QuickNoteAiAction[]) => {
    if (!actions.length) return;
    executeMutation.mutate({ actions });
  };

  const handleApplyWithChanges = async () => {
    if (!hasCommentEdits) {
      applySelection(selectedActions);
      return;
    }

    try {
      const refinedActions: QuickNoteAiAction[] = [];
      for (const suggestion of selectedSuggestions) {
        const comment = commentBySuggestion[suggestion.id]?.trim();
        if (!comment) {
          refinedActions.push(...suggestion.actions);
          continue;
        }
        const feedback = `Suggestion "${suggestion.title}": ${comment}`;
        const refined = await refineMutation.mutateAsync({
          feedback,
          maxSuggestions: 1,
        });
        const refinedSuggestion = refined.suggestions[0];
        if (!refinedSuggestion) {
          toastError('Aucune suggestion IA après modification.');
          return;
        }
        refinedActions.push(...refinedSuggestion.actions);
      }

      const deduped = dedupeActions(refinedActions);

      if (!deduped.length) {
        toastError('Aucune action IA applicable après modification.');
        return;
      }
      applySelection(deduped);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Erreur IA');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start p-4 sm:items-center sm:justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        aria-label="Fermer le panneau IA"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Assistant IA</h3>
            <p className="text-xs text-muted">{providerLabel}</p>
            <p className="mt-1 text-sm text-foreground/90">{note.text}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted transition hover:text-foreground"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {warnings.join(' ')}
          </div>
        )}

        {executionResults.some((entry) => !entry.success) && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <p className="font-semibold">Certaines actions ont échoué:</p>
            <ul className="mt-1 space-y-1">
              {executionResults
                .filter((entry) => !entry.success)
                .map((entry) => (
                  <li key={`${entry.index}-${entry.type}`}>
                    • {entry.type}: {entry.message}
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-muted">
              Génération des suggestions IA...
            </div>
          )}

          {!isLoading && suggestions.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-muted">
              Aucune suggestion disponible.
            </div>
          )}

          {suggestions.map((suggestion) => {
            const checked = selectedSuggestionIds.includes(suggestion.id);
            return (
              <label
                key={suggestion.id}
                className="block rounded-lg border border-white/10 bg-card/30 px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      setSelectedSuggestionIds((prev) => {
                        if (event.target.checked) {
                          return Array.from(new Set([...prev, suggestion.id]));
                        }
                        return prev.filter((value) => value !== suggestion.id);
                      });
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{suggestion.title}</p>
                      <span className="text-[11px] text-muted">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{suggestion.why}</p>
                    <ul className="mt-2 space-y-1 text-xs text-foreground/90">
                      {suggestion.actions.map((action, index) => (
                        <li key={`${suggestion.id}-${index}`}>
                          • {formatActionSummary(action)}
                        </li>
                      ))}
                    </ul>
                    {checked && (
                      <div className="mt-3">
                        <label className="mb-1 block text-[11px] text-muted">
                          Commentaire pour ajuster cette proposition
                        </label>
                        <textarea
                          value={commentBySuggestion[suggestion.id] ?? ''}
                          onChange={(event) =>
                            setCommentBySuggestion((prev) => ({
                              ...prev,
                              [suggestion.id]: event.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Ex: au lieu de 45% mets 65%"
                          className="w-full resize-none rounded-lg border border-white/10 bg-surface/70 px-3 py-2 text-xs text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {selectedActions.length} action(s) seront exécutées.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => suggestMutation.mutate({ instructions: undefined })}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Régénérer
            </button>
            <button
              type="button"
              disabled={isLoading || !hasCommentEdits}
              onClick={handleApplyWithChanges}
              className="rounded-full border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Appliquer avec modifications
            </button>
            <button
              type="button"
              disabled={isLoading || selectedActions.length === 0}
              onClick={() => applySelection(selectedActions)}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {executeMutation.isPending ? 'Exécution...' : 'Appliquer la sélection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatActionSummary(action: QuickNoteAiAction): string {
  const labels = action.labels ?? {};
  switch (action.type) {
    case 'MOVE_NODE_TO_COLUMN':
      return `Déplacer la carte ${toLabel(labels.nodeTitle ?? action.params.nodeId)} vers ${toLabel(labels.targetColumnName ?? action.params.targetColumnId)}`;
    case 'UPDATE_NODE_FIELDS':
      return `Mettre à jour ${toLabel(labels.nodeTitle ?? action.params.nodeId)} (${Object.keys(
        asRecord(action.params.fields),
      ).join(', ')})`;
    case 'APPEND_NODE_DESCRIPTION':
      return `Ajouter à la description de ${toLabel(labels.nodeTitle ?? action.params.nodeId)}`;
    case 'ADD_COMMENT':
      return `Ajouter un commentaire sur ${toLabel(labels.nodeTitle ?? action.params.nodeId)}`;
    case 'CREATE_CHILD_TASK':
      return `Créer une sous-tâche "${toLabel(action.params.title)}"`;
    default:
      return action.type;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function toLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value === null) return '(aucun)';
  if (value === undefined) return '(n/a)';
  return String(value);
}

function collectActions(suggestions: QuickNoteAiSuggestion[]): QuickNoteAiAction[] {
  const dedup = new Map<string, QuickNoteAiAction>();
  for (const suggestion of suggestions) {
    for (const action of suggestion.actions) {
      const key = `${action.type}:${JSON.stringify(action.params)}`;
      if (!dedup.has(key)) {
        dedup.set(key, action);
      }
    }
  }
  return Array.from(dedup.values());
}

function dedupeActions(actions: QuickNoteAiAction[]): QuickNoteAiAction[] {
  const dedup = new Map<string, QuickNoteAiAction>();
  for (const action of actions) {
    const key = `${action.type}:${JSON.stringify(action.params)}`;
    if (!dedup.has(key)) {
      dedup.set(key, action);
    }
  }
  return Array.from(dedup.values());
}
