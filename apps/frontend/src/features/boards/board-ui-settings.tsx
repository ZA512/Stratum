"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useBoardData } from "./board-data-provider";

type BoardViewMode = "kanban" | "gantt";

interface BoardUiSettingsContextValue {
  expertMode: boolean;
  setExpertMode: (value: boolean) => void;
  boardView: BoardViewMode;
  setBoardView: (value: BoardViewMode) => void;
}

const BoardUiSettingsContext = createContext<BoardUiSettingsContextValue | null>(null);

export function BoardUiSettingsProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useBoardData();
  const [expertMode, setExpertModeState] = useState(false);
  const [boardView, setBoardViewState] = useState<BoardViewMode>("kanban");

  useEffect(() => {
    if (!teamId) {
      setExpertModeState(false);
      setBoardViewState("kanban");
      return;
    }
    const key = `stratum:team:${teamId}:expert-mode`;
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      if (stored === "true") {
        setExpertModeState(true);
      } else if (stored === "false") {
        setExpertModeState(false);
      } else {
        setExpertModeState(false);
      }
    } catch {
      setExpertModeState(false);
    }
    const viewKey = `stratum:team:${teamId}:board-view`;
    try {
      const storedView = typeof window !== "undefined" ? window.localStorage.getItem(viewKey) : null;
      if (storedView === "gantt") {
        setBoardViewState("gantt");
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
      if (!teamId) return;
      try {
        if (typeof window !== "undefined") {
          const key = `stratum:team:${teamId}:expert-mode`;
          window.localStorage.setItem(key, value ? "true" : "false");
        }
      } catch {
        // ignore storage errors
      }
    },
    [teamId],
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

  const contextValue: BoardUiSettingsContextValue = {
    expertMode,
    setExpertMode,
    boardView,
    setBoardView,
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
