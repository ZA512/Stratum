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

type ActionParamUpdater = (index: number, key: string, value: unknown) => void;
type ActionFieldUpdater = (index: number, key: string, value: unknown) => void;

const ACTION_INPUT_CLASS =
  'w-full rounded-lg border border-white/10 bg-surface/70 px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export function QuickNoteAiPanel({ note, onClose }: QuickNoteAiPanelProps) {
  const queryClient = useQueryClient();
  const { success, error: toastError, warning } = useToast();
  const [suggestions, setSuggestions] = useState<QuickNoteAiSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [providerLabel, setProviderLabel] = useState<string>('—');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [feedback, setFeedback] = useState('');
  const [executionResults, setExecutionResults] = useState<
    QuickNoteAiExecutionResult[]
  >([]);
  const [editableActions, setEditableActions] = useState<QuickNoteAiAction[]>([]);

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
    mutationFn: (input: { feedback: string; instructions?: string }) =>
      refineQuickNoteAi(note.id, {
        feedback: input.feedback,
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
    setInstructions('');
    setFeedback('');
    setExecutionResults([]);
    setEditableActions([]);
    suggestMutation.mutate({ instructions: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const selectedActions = useMemo(() => {
    const selected = suggestions.filter((item) =>
      selectedSuggestionIds.includes(item.id),
    );
    const dedup = new Map<string, QuickNoteAiAction>();
    for (const suggestion of selected) {
      for (const action of suggestion.actions) {
        const key = `${action.type}:${JSON.stringify(action.params)}`;
        if (!dedup.has(key)) {
          dedup.set(key, cloneAction(action));
        }
      }
    }
    return Array.from(dedup.values());
  }, [suggestions, selectedSuggestionIds]);

  useEffect(() => {
    setEditableActions(selectedActions.map(cloneAction));
    setExecutionResults([]);
  }, [selectedActions]);

  const executableActions = editableActions;
  const isLoading = suggestMutation.isPending || refineMutation.isPending;

  const updateActionParam: ActionParamUpdater = (index, key, value) => {
    setEditableActions((previous) =>
      previous.map((action, actionIndex) => {
        if (actionIndex !== index) return action;
        const nextParams = { ...action.params };
        if (value === undefined) {
          delete nextParams[key];
        } else {
          nextParams[key] = value;
        }
        return { ...action, params: nextParams };
      }),
    );
    setExecutionResults([]);
  };

  const updateActionField: ActionFieldUpdater = (index, key, value) => {
    setEditableActions((previous) =>
      previous.map((action, actionIndex) => {
        if (actionIndex !== index) return action;
        const nextParams = { ...action.params };
        const nextFields = asRecord(nextParams.fields);
        if (value === undefined) {
          delete nextFields[key];
        } else {
          nextFields[key] = value;
        }
        if (Object.keys(nextFields).length === 0) {
          delete nextParams.fields;
        } else {
          nextParams.fields = nextFields;
        }
        return { ...action, params: nextParams };
      }),
    );
    setExecutionResults([]);
  };

  const removeAction = (index: number) => {
    setEditableActions((previous) =>
      previous.filter((_, actionIndex) => actionIndex !== index),
    );
    setExecutionResults([]);
  };

  const resetEditedActions = () => {
    setEditableActions(selectedActions.map(cloneAction));
    setExecutionResults([]);
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
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Actions à appliquer (éditables)
            </h4>
            <button
              type="button"
              onClick={resetEditedActions}
              disabled={selectedActions.length === 0}
              className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-foreground transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Réinitialiser
            </button>
          </div>

          {executableActions.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Sélectionne au moins une proposition pour éditer les actions.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {executableActions.map((action, index) => (
                <EditableQuickNoteActionEditor
                  key={`${index}-${action.type}`}
                  action={action}
                  index={index}
                  onParamChange={updateActionParam}
                  onFieldChange={updateActionField}
                  onRemove={removeAction}
                />
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Instructions complémentaires
            </label>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-surface/70 px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder="Optionnel: prioriser des actions simples..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Ajuster une proposition
            </label>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-white/10 bg-surface/70 px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              placeholder='Ex: "La proposition 2 est bonne mais sur le kanban hhhh et 45%"'
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            {executableActions.length} action(s) seront exécutées.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => suggestMutation.mutate({ instructions })}
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Régénérer
            </button>
            <button
              type="button"
              disabled={isLoading || feedback.trim().length === 0}
              onClick={() =>
                refineMutation.mutate({
                  feedback: feedback.trim(),
                  instructions,
                })
              }
              className="rounded-full border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Affiner
            </button>
            <button
              type="button"
              disabled={
                executeMutation.isPending || executableActions.length === 0
              }
              onClick={() =>
                executeMutation.mutate({
                  actions: executableActions,
                })
              }
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {executeMutation.isPending
                ? 'Exécution...'
                : 'Appliquer la sélection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type EditableQuickNoteActionEditorProps = {
  action: QuickNoteAiAction;
  index: number;
  onParamChange: ActionParamUpdater;
  onFieldChange: ActionFieldUpdater;
  onRemove: (index: number) => void;
};

function EditableQuickNoteActionEditor({
  action,
  index,
  onParamChange,
  onFieldChange,
  onRemove,
}: EditableQuickNoteActionEditorProps) {
  const fields = asRecord(action.params.fields);

  return (
    <div className="rounded-lg border border-white/10 bg-card/30 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
          {action.type}
        </span>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="rounded-full border border-white/20 px-2 py-1 text-[10px] font-medium text-muted transition hover:border-red-400/60 hover:text-red-200"
        >
          Retirer
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {action.type === 'MOVE_NODE_TO_COLUMN' && (
          <>
            <ActionTextInput
              label="Carte (nodeId)"
              value={toEditableString(action.params.nodeId)}
              placeholder="node_123"
              onChange={(value) =>
                onParamChange(index, 'nodeId', parseOptionalString(value))
              }
            />
            <ActionTextInput
              label="Colonne cible (columnId)"
              value={toEditableString(action.params.targetColumnId)}
              placeholder="column_123"
              onChange={(value) =>
                onParamChange(
                  index,
                  'targetColumnId',
                  parseOptionalString(value),
                )
              }
            />
            <ActionTextInput
              label="Position (optionnel)"
              type="number"
              value={toEditableNumberString(action.params.position)}
              placeholder="0"
              onChange={(value) =>
                onParamChange(index, 'position', parseOptionalInteger(value))
              }
            />
          </>
        )}

        {action.type === 'UPDATE_NODE_FIELDS' && (
          <>
            <ActionTextInput
              label="Carte (nodeId)"
              value={toEditableString(action.params.nodeId)}
              placeholder="node_123"
              onChange={(value) =>
                onParamChange(index, 'nodeId', parseOptionalString(value))
              }
            />
            <ActionTextInput
              label="Progress % (optionnel)"
              type="number"
              value={toEditableNumberString(fields.progress)}
              placeholder="45"
              onChange={(value) =>
                onFieldChange(index, 'progress', parseOptionalPercent(value))
              }
            />
            <ActionTextInput
              label="Titre (optionnel)"
              value={toEditableString(fields.title)}
              placeholder="Nouveau titre"
              onChange={(value) =>
                onFieldChange(index, 'title', parseOptionalString(value))
              }
            />
            <ActionTextInput
              label="Échéance (optionnel)"
              value={toEditableString(fields.dueAt)}
              placeholder="2026-02-06T17:00:00.000Z"
              onChange={(value) =>
                onFieldChange(index, 'dueAt', parseOptionalString(value))
              }
            />
            <ActionTextArea
              label="Description (optionnel)"
              value={toEditableString(fields.description)}
              onChange={(value) =>
                onFieldChange(index, 'description', parseOptionalString(value))
              }
              className="sm:col-span-2"
            />
            <ActionTextArea
              label="Raison de blocage (optionnel)"
              value={toEditableString(fields.blockedReason)}
              onChange={(value) =>
                onFieldChange(index, 'blockedReason', parseOptionalString(value))
              }
              className="sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={Boolean(fields.isBlockResolved)}
                onChange={(event) =>
                  onFieldChange(index, 'isBlockResolved', event.target.checked)
                }
              />
              Marquer le blocage comme résolu
            </label>
          </>
        )}

        {action.type === 'ADD_COMMENT' && (
          <>
            <ActionTextInput
              label="Carte (nodeId)"
              value={toEditableString(action.params.nodeId)}
              placeholder="node_123"
              onChange={(value) =>
                onParamChange(index, 'nodeId', parseOptionalString(value))
              }
            />
            <ActionTextArea
              label="Commentaire"
              value={toEditableString(action.params.body)}
              onChange={(value) =>
                onParamChange(index, 'body', parseOptionalString(value))
              }
              className="sm:col-span-2"
            />
          </>
        )}

        {action.type === 'CREATE_CHILD_TASK' && (
          <>
            <ActionTextInput
              label="Parent (nodeId)"
              value={toEditableString(action.params.parentNodeId)}
              placeholder="node_parent"
              onChange={(value) =>
                onParamChange(index, 'parentNodeId', parseOptionalString(value))
              }
            />
            <ActionTextInput
              label="Titre"
              value={toEditableString(action.params.title)}
              placeholder="Nouvelle tâche"
              onChange={(value) =>
                onParamChange(index, 'title', parseOptionalString(value))
              }
            />
            <ActionTextInput
              label="Échéance (optionnel)"
              value={toEditableString(action.params.dueAt)}
              placeholder="2026-02-06T17:00:00.000Z"
              onChange={(value) =>
                onParamChange(index, 'dueAt', parseOptionalString(value))
              }
            />
            <ActionTextArea
              label="Description (optionnel)"
              value={toEditableString(action.params.description)}
              onChange={(value) =>
                onParamChange(index, 'description', parseOptionalString(value))
              }
              className="sm:col-span-2"
            />
          </>
        )}

        {action.type === 'ATTACH_QUICK_NOTE_TO_KANBAN' && (
          <ActionTextInput
            label="Kanban (ID ou nom, vide pour détacher)"
            value={toEditableString(action.params.kanbanId)}
            placeholder="board_123 ou nom du kanban"
            onChange={(value) => {
              const reference = value.trim();
              onParamChange(index, 'kanbanId', reference.length ? reference : null);
            }}
            className="sm:col-span-2"
          />
        )}

        {action.type === 'TREAT_QUICK_NOTE' && (
          <p className="text-xs text-muted">
            Cette action marquera la quick note comme traitée.
          </p>
        )}
      </div>
    </div>
  );
}

type ActionTextInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
  className?: string;
};

function ActionTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: ActionTextInputProps) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        className={ACTION_INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type ActionTextAreaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

function ActionTextArea({
  label,
  value,
  onChange,
  className,
}: ActionTextAreaProps) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <textarea
        value={value}
        rows={2}
        className={`${ACTION_INPUT_CLASS} resize-none`}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function formatActionSummary(action: QuickNoteAiAction): string {
  switch (action.type) {
    case 'MOVE_NODE_TO_COLUMN':
      return `Déplacer la carte ${toLabel(action.params.nodeId)} vers ${toLabel(action.params.targetColumnId)}`;
    case 'UPDATE_NODE_FIELDS':
      return `Mettre à jour ${toLabel(action.params.nodeId)} (${Object.keys(
        asRecord(action.params.fields),
      ).join(', ')})`;
    case 'ADD_COMMENT':
      return `Ajouter un commentaire sur ${toLabel(action.params.nodeId)}`;
    case 'CREATE_CHILD_TASK':
      return `Créer une sous-tâche "${toLabel(action.params.title)}"`;
    case 'ATTACH_QUICK_NOTE_TO_KANBAN':
      return `Rattacher la note à ${toLabel(action.params.kanbanId)}`;
    case 'TREAT_QUICK_NOTE':
      return 'Traiter la quick note';
    default:
      return action.type;
  }
}

function cloneAction(action: QuickNoteAiAction): QuickNoteAiAction {
  return {
    type: action.type,
    params: safeCloneObject(action.params),
  };
}

function safeCloneObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return { ...value };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function toEditableString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toEditableNumberString(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function parseOptionalString(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.round(numeric));
}

function parseOptionalPercent(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function toLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value === null) return '(aucun)';
  if (value === undefined) return '(n/a)';
  return String(value);
}
