"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useBoardData } from "./board-data-provider";

interface BoardUiSettingsContextValue {
  expertMode: boolean;
  setExpertMode: (value: boolean) => void;
}

const BoardUiSettingsContext = createContext<BoardUiSettingsContextValue | null>(null);

export function BoardUiSettingsProvider({ children }: { children: React.ReactNode }) {
  const { teamId } = useBoardData();
  const [expertMode, setExpertModeState] = useState(false);

  useEffect(() => {
    if (!teamId) {
      setExpertModeState(false);
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

  const contextValue: BoardUiSettingsContextValue = {
    expertMode,
    setExpertMode,
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
