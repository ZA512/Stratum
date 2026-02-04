"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MultiSelectCombo } from "@/components/ui/MultiSelectCombo";
import { useToast } from "@/components/toast/ToastProvider";
import { useQuickNotesStore } from "@/stores/quick-notes";
import { useAuth } from "@/features/auth/auth-provider";
import { usePathname } from "next/navigation";
import {
  useCreateQuickNote,
  useQuickNotesBoards,
  useQuickNotesOpen,
  type QuickNoteType,
} from "@/features/quick-notes/useQuickNotes";

const TYPE_OPTIONS: Array<{ id: QuickNoteType; label: string; icon: string }> = [
  { id: "DONE", label: "FAIT", icon: "check_circle" },
  { id: "WAITING", label: "ATTENTE", icon: "schedule" },
  { id: "NOTE", label: "NOTE", icon: "sticky_note_2" },
];

export function QuickNotesRadar() {
  const { isModalOpen, openModal, closeModal, showDock } = useQuickNotesStore();
  const { success, error: toastError } = useToast();
  const { accessToken } = useAuth();
  const pathname = usePathname();
  const { data: openNotes } = useQuickNotesOpen(Boolean(accessToken));
  const { data: boards } = useQuickNotesBoards(Boolean(accessToken));
  const createMutation = useCreateQuickNote();
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);

  const [selectedType, setSelectedType] = useState<QuickNoteType>("NOTE");
  const [noteText, setNoteText] = useState("");
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);

  const openCount = openNotes?.count ?? 0;
  const selectedBoardId = selectedBoardIds[0] ?? null;

  const boardOptions = useMemo(() => {
    return (boards ?? []).map((board) => ({
      id: board.id,
      label: board.name,
      description: board.teamName,
      searchText: `${board.name} ${board.teamName}`,
    }));
  }, [boards]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const handleSubmit = useCallback(
    async (mode: "continue" | "close") => {
      const trimmed = noteText.trim();
      if (!trimmed) return;
      try {
        await createMutation.mutateAsync({
          text: trimmed,
          type: selectedType,
          kanbanId: selectedBoardId,
        });
        setNoteText("");
        success("Note enregistrée");
        if (mode === "close") {
          handleClose();
        }
      } catch (err) {
        toastError(err instanceof Error ? err.message : "Erreur inattendue");
      }
    },
    [noteText, createMutation, selectedType, selectedBoardId, success, toastError, handleClose],
  );

  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isModalOpen, handleClose]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const locateAnchor = () => {
      const anchor = document.querySelector<HTMLElement>(
        "[data-quick-notes-anchor='header']",
      );
      setHeaderAnchor(anchor);
    };

    locateAnchor();

    const observer = new MutationObserver(() => locateAnchor());
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (accessToken) return;
    closeModal();
  }, [accessToken, closeModal]);

  const isSubmitting = createMutation.isPending;
  const canSubmit = noteText.trim().length > 0 && !isSubmitting;

  if (!accessToken) {
    return null;
  }

  const quickNoteButton = (
    <button
      type="button"
      onClick={openModal}
      className="flex h-9 items-center gap-2 rounded-full border border-white/15 bg-surface/70 px-3 text-xs font-semibold text-foreground transition hover:border-accent hover:text-foreground"
    >
      <span className="material-symbols-outlined text-[18px]">radar</span>
      Quick Note
      {openCount > 0 && (
        <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-background">
          {openCount}
        </span>
      )}
    </button>
  );

  return (
    <>
      {headerAnchor ? createPortal(quickNoteButton, headerAnchor) : null}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Quick Notes</h2>
                <p className="text-xs text-muted">Capture rapide, traitement plus tard.</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted transition hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-muted">
                  Kanban (optionnel)
                </label>
                <MultiSelectCombo
                  options={boardOptions}
                  selectedIds={selectedBoardIds}
                  onChange={(ids) => setSelectedBoardIds(ids.slice(-1))}
                  placeholder="À classer plus tard (Inbox)"
                  searchPlaceholder="Rechercher un kanban..."
                  emptyMessage="Aucun kanban disponible"
                  noResultsMessage="Aucun résultat"
                  keepMenuOpen={false}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-muted">Texte</label>
                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmit("continue");
                    }
                  }}
                  autoFocus
                  rows={3}
                  className="w-full resize-none rounded-xl border border-white/10 bg-surface/70 px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="Note rapide..."
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-muted">Type</label>
                <div className="flex items-center gap-2">
                  {TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedType(option.id)}
                      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition ${
                        selectedType === option.id
                          ? "border-accent bg-accent/10 text-foreground"
                          : "border-white/10 bg-surface/60 text-muted hover:border-accent/60"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {openCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    showDock();
                    handleClose();
                  }}
                  className="rounded-full border border-accent/40 px-4 py-2 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent/10"
                >
                  Traitement des entrées
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit("continue")}
                  className="rounded-full bg-accent/90 px-4 py-2 text-xs font-semibold text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Valider & continuer
                </button>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit("close")}
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-foreground transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Valider & fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
