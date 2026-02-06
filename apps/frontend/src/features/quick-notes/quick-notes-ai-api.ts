import { apiPost } from '@/lib/api-client';

export type QuickNoteAiActionType =
  | 'MOVE_NODE_TO_COLUMN'
  | 'UPDATE_NODE_FIELDS'
  | 'ADD_COMMENT'
  | 'CREATE_CHILD_TASK'
  | 'ATTACH_QUICK_NOTE_TO_KANBAN'
  | 'TREAT_QUICK_NOTE';

export type QuickNoteAiAction = {
  type: QuickNoteAiActionType;
  params: Record<string, unknown>;
};

export type QuickNoteAiSuggestion = {
  id: string;
  title: string;
  why: string;
  confidence: number;
  actions: QuickNoteAiAction[];
};

export type QuickNoteAiSuggestionsResponse = {
  noteId: string;
  provider: string;
  model: string;
  suggestions: QuickNoteAiSuggestion[];
  warnings: string[];
};

export type QuickNoteAiExecutionResult = {
  index: number;
  type: QuickNoteAiActionType;
  success: boolean;
  message: string;
};

export type QuickNoteAiExecutionResponse = {
  noteId: string;
  totalActions: number;
  succeeded: number;
  failed: number;
  treated: boolean;
  results: QuickNoteAiExecutionResult[];
};

export async function suggestQuickNoteAi(
  noteId: string,
  input?: { instructions?: string; maxSuggestions?: number },
): Promise<QuickNoteAiSuggestionsResponse> {
  const response = await apiPost(`quick-notes/${noteId}/ai/suggest`, {
    instructions: input?.instructions ?? undefined,
    maxSuggestions: input?.maxSuggestions ?? undefined,
  });

  if (!response.ok) {
    throw await parseQuickNoteAiError(
      response,
      'Impossible de générer des suggestions IA',
    );
  }

  return (await response.json()) as QuickNoteAiSuggestionsResponse;
}

export async function refineQuickNoteAi(
  noteId: string,
  input: { feedback: string; instructions?: string; maxSuggestions?: number },
): Promise<QuickNoteAiSuggestionsResponse> {
  const response = await apiPost(`quick-notes/${noteId}/ai/refine`, {
    feedback: input.feedback,
    instructions: input.instructions ?? undefined,
    maxSuggestions: input.maxSuggestions ?? undefined,
  });

  if (!response.ok) {
    throw await parseQuickNoteAiError(
      response,
      "Impossible d'affiner les suggestions IA",
    );
  }

  return (await response.json()) as QuickNoteAiSuggestionsResponse;
}

export async function executeQuickNoteAi(
  noteId: string,
  input: { actions: QuickNoteAiAction[]; treatQuickNoteOnSuccess?: boolean },
): Promise<QuickNoteAiExecutionResponse> {
  const response = await apiPost(`quick-notes/${noteId}/ai/execute`, {
    actions: input.actions,
    treatQuickNoteOnSuccess: input.treatQuickNoteOnSuccess ?? false,
  });

  if (!response.ok) {
    throw await parseQuickNoteAiError(
      response,
      "Impossible d'exécuter les actions IA",
    );
  }

  return (await response.json()) as QuickNoteAiExecutionResponse;
}

async function parseQuickNoteAiError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    const message = payload?.message || payload?.error || fallback;
    const err = new Error(message);
    (err as { status?: number }).status = response.status;
    return err;
  } catch {
    const err = new Error(fallback);
    (err as { status?: number }).status = response.status;
    return err;
  }
}
