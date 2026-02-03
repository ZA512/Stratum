import { create } from "zustand";

export type NavigationDirection = -1 | 0 | 1;

export type UiShellState = {
  depth: number;
  direction: NavigationDirection;
  setNavigation: (depth: number, direction: NavigationDirection) => void;
};

export const useUiShellStore = create<UiShellState>((set) => ({
  depth: 0,
  direction: 0,
  setNavigation: (depth, direction) => set({ depth, direction }),
}));
