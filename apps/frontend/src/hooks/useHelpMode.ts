import { useState, useEffect } from 'react';

const HELP_MODE_KEY = 'stratum-help-mode';

/**
 * Hook pour gérer le mode aide contextuelle.
 * Permet d'afficher/masquer les tooltips éducatifs.
 * L'état est persisté dans localStorage.
 */
export function useHelpMode() {
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

  return { helpMode, toggleHelpMode };
}
