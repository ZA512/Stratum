"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME, themeById, themes } from "./index";
import type { ThemeDefinition } from "./types";

type ThemeId = ThemeDefinition["id"];

interface ThemeContextValue {
  activeThemeId: ThemeId;
  activeTheme: ThemeDefinition;
  themes: ThemeDefinition[];
  setTheme: (id: ThemeId) => void;
}

const STORAGE_KEY = "stratum:theme";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeDefinition) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme.id);
  root.classList.toggle("dark", theme.tone === "dark");
  root.style.setProperty("color-scheme", theme.tone === "dark" ? "dark" : "light");
  Object.entries(theme.cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(DEFAULT_THEME.id);

  // Initial load from storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && themeById.has(stored)) {
      setActiveThemeId(stored as ThemeId);
    } else {
      setActiveThemeId(DEFAULT_THEME.id);
    }
  }, []);

  // Apply & persist the theme when it changes
  useEffect(() => {
    const theme = themeById.get(activeThemeId) ?? DEFAULT_THEME;
    applyTheme(theme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme.id);
    }
  }, [activeThemeId]);

  const setTheme = useCallback((id: ThemeId) => {
    if (!themeById.has(id)) return;
    setActiveThemeId(id);
  }, []);

  const contextValue = useMemo<ThemeContextValue>(() => {
    const theme = themeById.get(activeThemeId) ?? DEFAULT_THEME;
    return {
      activeThemeId,
      activeTheme: theme,
      themes,
      setTheme,
    };
  }, [activeThemeId, setTheme]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("ThemeProvider missing in tree");
  }
  return ctx;
}
