import { create } from "zustand";

type QuickNotesUiState = {
  isModalOpen: boolean;
  isDockHidden: boolean;
  openModal: () => void;
  closeModal: () => void;
  hideDock: () => void;
  showDock: () => void;
  resetDockHidden: () => void;
};

export const useQuickNotesStore = create<QuickNotesUiState>((set) => ({
  isModalOpen: false,
  isDockHidden: false,
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  hideDock: () => set({ isDockHidden: true }),
  showDock: () => set({ isDockHidden: false }),
  resetDockHidden: () => set({ isDockHidden: false }),
}));
