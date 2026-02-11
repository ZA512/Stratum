import { apiGet, apiPost } from "@/lib/api-client";

export type QuickNoteType = "NOTE" | "DONE" | "WAITING";

export type QuickNote = {
  id: string;
  text: string;
  type: QuickNoteType;
  kanbanId: string | null;
  kanbanName: string | null;
  kanbanTeamId: string | null;
  kanbanAvailable: boolean;
  createdAt: string;
  treatedAt: string | null;
};

export type QuickNoteList = {
  items: QuickNote[];
  count: number;
};

export type QuickNoteBoard = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
};

export async function fetchOpenQuickNotes(): Promise<QuickNoteList> {
  const response = await apiGet("quick-notes?status=open", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible de charger les notes rapides");
  }

  return (await response.json()) as QuickNoteList;
}

export async function fetchQuickNoteBoards(params?: {
  search?: string;
  limit?: number;
}): Promise<QuickNoteBoard[]> {
  const search = params?.search?.trim();
  const limit = params?.limit;
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (typeof limit === 'number' && Number.isFinite(limit)) {
    query.set('limit', String(limit));
  }
  const suffix = query.toString();
  const response = await apiGet(`quick-notes/boards${suffix ? `?${suffix}` : ''}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible de charger les kanbans");
  }

  return (await response.json()) as QuickNoteBoard[];
}

export async function createQuickNote(input: {
  text: string;
  type: QuickNoteType;
  kanbanId?: string | null;
}): Promise<QuickNote> {
  const response = await apiPost("quick-notes", {
    text: input.text,
    type: input.type,
    kanbanId: input.kanbanId ?? null,
  });

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible de créer la note");
  }

  return (await response.json()) as QuickNote;
}

export async function treatQuickNote(id: string): Promise<QuickNote> {
  const response = await apiPost(`quick-notes/${id}/treat`);

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible d'archiver la note");
  }

  return (await response.json()) as QuickNote;
}

export async function attachQuickNote(id: string, kanbanId: string | null): Promise<QuickNote> {
  const response = await apiPost(`quick-notes/${id}/attach`, {
    kanbanId,
  });

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible d'attacher le kanban");
  }

  return (await response.json()) as QuickNote;
}

export async function cleanupQuickNotes(): Promise<{ deleted: number }> {
  const response = await apiPost("quick-notes/cleanup");

  if (!response.ok) {
    throw await parseQuickNotesError(response, "Impossible de nettoyer les notes");
  }

  return (await response.json()) as { deleted: number };
}

async function parseQuickNotesError(response: Response, fallback: string): Promise<Error> {
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
