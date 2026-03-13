"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useBoardData } from "./board-data-provider";
import {
  persistBreadcrumbVariant,
  readStoredBreadcrumbVariant,
  type BreadcrumbVariant,
} from "./breadcrumb-preferences";

type BoardViewMode = "kanban" | "gantt" | "list" | "mindmap";

const EXPERT_MODE_STORAGE_KEY = "stratum:preferences:expert-mode";

export function readStoredExpertMode(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(EXPERT_MODE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function persistExpertMode(value: boolean): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(EXPERT_MODE_STORAGE_KEY, value ? "true" : "false");
  } catch {
    // ignore storage errors
  }
}

interface BoardUiSettingsContextValue {
  expertMode: boolean;
  setExpertMode: (value: boolean) => void;
  boardView: BoardViewMode;
  setBoardView: (value: BoardViewMode) => void;
  breadcrumbVariant: BreadcrumbVariant;
  setBreadcrumbVariant: (value: BreadcrumbVariant) => void;
}

const BoardUiSettingsContext = createContext<BoardUiSettingsContextValue | null>(null);

export function BoardUiSettingsProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useBoardData();
  const [expertMode, setExpertModeState] = useState(false);
  const [boardView, setBoardViewState] = useState<BoardViewMode>("kanban");
  const [breadcrumbVariant, setBreadcrumbVariantState] = useState<BreadcrumbVariant>("fractal");

  useEffect(() => {
    setBreadcrumbVariantState(readStoredBreadcrumbVariant());
  }, []);

  useEffect(() => {
    setExpertModeState(readStoredExpertMode());
    if (!teamId) {
      setBoardViewState("kanban");
      return;
    }
    const viewKey = `stratum:team:${teamId}:board-view`;
    try {
      const storedView = typeof window !== "undefined" ? window.localStorage.getItem(viewKey) : null;
      if (storedView === "gantt") {
        setBoardViewState("gantt");
      } else if (storedView === "list") {
        setBoardViewState("list");
      } else if (storedView === "mindmap") {
        setBoardViewState("mindmap");
      } else {
        setBoardViewState("kanban");
      }
    } catch {
      setBoardViewState("kanban");
    }
  }, [teamId]);

  const setExpertMode = useCallback(
    (value: boolean) => {
      setExpertModeState(value);
      persistExpertMode(value);
    },
    [],
  );

  const setBoardView = useCallback(
    (value: BoardViewMode) => {
      setBoardViewState(value);
      if (!teamId) return;
      try {
        if (typeof window !== "undefined") {
          const key = `stratum:team:${teamId}:board-view`;
          window.localStorage.setItem(key, value);
        }
      } catch {
        // ignore storage errors
      }
    },
    [teamId],
  );

  const setBreadcrumbVariant = useCallback((value: BreadcrumbVariant) => {
    setBreadcrumbVariantState(value);
    persistBreadcrumbVariant(value);
  }, []);

  const contextValue: BoardUiSettingsContextValue = {
    expertMode,
    setExpertMode,
    boardView,
    setBoardView,
    breadcrumbVariant,
    setBreadcrumbVariant,
  };

  return (
    <BoardUiSettingsContext.Provider value={contextValue}>
      {children}
    </BoardUiSettingsContext.Provider>
  );
}

export function useBoardUiSettings() {
  const ctx = useContext(BoardUiSettingsContext);
  if (!ctx) {
    throw new Error("BoardUiSettingsProvider missing in tree");
  }
  return ctx;
}
