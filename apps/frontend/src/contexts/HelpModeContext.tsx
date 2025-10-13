"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

const HELP_MODE_KEY = 'stratum-help-mode';

interface HelpModeContextValue {
  helpMode: boolean;
  toggleHelpMode: () => void;
}

const HelpModeContext = createContext<HelpModeContextValue | undefined>(undefined);

export function HelpModeProvider({ children }: { children: React.ReactNode }) {
  const [helpMode, setHelpMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(HELP_MODE_KEY) === 'true';
  });

  const toggleHelpMode = () => {
    const newMode = !helpMode;
    setHelpMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem(HELP_MODE_KEY, String(newMode));
    }
  };

  // Synchroniser avec les changements dans d'autres onglets
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === HELP_MODE_KEY) {
        setHelpMode(e.newValue === 'true');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <HelpModeContext.Provider value={{ helpMode, toggleHelpMode }}>
      {children}
    </HelpModeContext.Provider>
  );
}

export function useHelpModeContext() {
  const context = useContext(HelpModeContext);
  if (context === undefined) {
    throw new Error('useHelpModeContext must be used within a HelpModeProvider');
  }
  return context;
}

// Optionnel : hook pour accéder au helpMode sans lancer d'erreur si hors contexte
export function useHelpModeValue(): boolean {
  const context = useContext(HelpModeContext);
  return context?.helpMode ?? false;
}
