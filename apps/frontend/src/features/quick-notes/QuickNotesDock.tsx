"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useToast } from "@/components/toast/ToastProvider";
import { useQuickNotesStore } from "@/stores/quick-notes";
import { useAuth } from "@/features/auth/auth-provider";
import {
  useCleanupQuickNotes,
  useQuickNotesOpen,
  useTreatQuickNote,
  type QuickNote,
} from "@/features/quick-notes/useQuickNotes";

const TYPE_ICON: Record<QuickNote["type"], string> = {
  DONE: "check_circle",
  WAITING: "schedule",
  NOTE: "sticky_note_2",
};

export function QuickNotesDock() {
  const { isDockHidden, hideDock, resetDockHidden } = useQuickNotesStore();
  const { accessToken } = useAuth();
  const { data } = useQuickNotesOpen(Boolean(accessToken));
  const { success, error: toastError } = useToast();
  const treatMutation = useTreatQuickNote();
  const cleanupMutation = useCleanupQuickNotes();
  const prevCountRef = useRef<number>(data?.count ?? 0);

  const notes = data?.items ?? [];
  const openCount = data?.count ?? 0;
  const shouldShowDock = openCount > 0 && !isDockHidden;

  useEffect(() => {
    const prev = prevCountRef.current;
    if (prev > 0 && openCount === 0) {
      resetDockHidden();
      cleanupMutation.mutate();
    }
    prevCountRef.current = openCount;
  }, [openCount, resetDockHidden, cleanupMutation]);

  useEffect(() => {
    if (accessToken) return;
    hideDock();
  }, [accessToken, hideDock]);

  const handleTreat = async (noteId: string) => {
    try {
      await treatMutation.mutateAsync(noteId);
      success("Note archivée");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Erreur inattendue");
    }
  };

  const handleHide = () => {
    hideDock();
    cleanupMutation.mutate();
  };

  const noteRows = useMemo(() => {
    return notes.map((note) => {
      const icon = TYPE_ICON[note.type];
      const canOpen = Boolean(note.kanbanId && note.kanbanTeamId && note.kanbanAvailable);
      const kanbanLabel = note.kanbanName ?? "Kanban supprimé";

      return (
        <div
          key={note.id}
          className="flex items-center gap-3 border-b border-white/5 py-2 text-sm last:border-b-0"
        >
          <span className="material-symbols-outlined text-base text-muted">{icon}</span>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-foreground">{note.text}</span>
            {note.kanbanName && (
              <div className="text-xs text-muted">
                {canOpen ? (
                  <Link
                    href={`/boards/${note.kanbanTeamId}/${note.kanbanId}`}
                    className="text-accent transition hover:underline"
                  >
                    {kanbanLabel}
                  </Link>
                ) : (
                  <span className="text-muted/80">{kanbanLabel}</span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleTreat(note.id)}
            className="rounded-full p-1 text-muted transition hover:text-foreground"
            aria-label="Traiter la note"
          >
            ✕
          </button>
        </div>
      );
    });
  }, [notes, handleTreat]);

  if (!accessToken || !shouldShowDock) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 z-40 w-[320px] rounded-2xl border border-white/10 bg-surface/95 shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Traitement des entrées</p>
          <p className="text-[11px] text-muted">{openCount} note(s) en attente</p>
        </div>
        <button
          type="button"
          onClick={handleHide}
          className="text-muted transition hover:text-foreground"
          aria-label="Masquer le dock"
        >
          ✕
        </button>
      </div>

      <div className="max-h-[240px] overflow-y-auto px-4 py-2">
        {noteRows}
      </div>
    </div>
  );
}
