import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachQuickNote,
  cleanupQuickNotes,
  createQuickNote,
  fetchOpenQuickNotes,
  fetchQuickNoteBoards,
  treatQuickNote,
  type QuickNote,
  type QuickNoteList,
  type QuickNoteType,
  type QuickNoteBoard,
} from "@/features/quick-notes/quick-notes-api";

const OPEN_NOTES_KEY = ["quick-notes", "open"];
const BOARDS_KEY = "quick-notes-boards";

export function useQuickNotesOpen(enabled = true) {
  return useQuery({
    queryKey: OPEN_NOTES_KEY,
    queryFn: fetchOpenQuickNotes,
    enabled,
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useQuickNotesBoards(
  enabled = true,
  params?: { search?: string; limit?: number },
) {
  return useQuery({
    queryKey: [BOARDS_KEY, params?.search ?? "", params?.limit ?? null],
    queryFn: () => fetchQuickNoteBoards(params),
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateQuickNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createQuickNote,
    onSuccess: (created) => {
      queryClient.setQueryData<QuickNoteList>(OPEN_NOTES_KEY, (prev) => {
        if (!prev) return { items: [created], count: 1 };
        return {
          items: [...prev.items, created],
          count: prev.count + 1,
        };
      });
    },
  });
}

export function useTreatQuickNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: treatQuickNote,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: OPEN_NOTES_KEY });
      const previous = queryClient.getQueryData<QuickNoteList>(OPEN_NOTES_KEY);
      if (previous) {
        queryClient.setQueryData<QuickNoteList>(OPEN_NOTES_KEY, {
          items: previous.items.filter((note) => note.id !== id),
          count: Math.max(0, previous.count - 1),
        });
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(OPEN_NOTES_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: OPEN_NOTES_KEY });
    },
  });
}

export function useAttachQuickNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, kanbanId }: { id: string; kanbanId: string | null }) =>
      attachQuickNote(id, kanbanId),
    onSuccess: (updated) => {
      queryClient.setQueryData<QuickNoteList>(OPEN_NOTES_KEY, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((note) => (note.id === updated.id ? updated : note)),
        };
      });
    },
  });
}

export function useCleanupQuickNotes() {
  return useMutation({
    mutationFn: cleanupQuickNotes,
  });
}

export type { QuickNote, QuickNoteList, QuickNoteType, QuickNoteBoard };
