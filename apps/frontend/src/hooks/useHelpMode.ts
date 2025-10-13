import { useHelpModeContext } from '@/contexts/HelpModeContext';

/**
 * Hook pour gérer le mode aide contextuelle.
 * Permet d'afficher/masquer les tooltips éducatifs.
 * L'état est persisté dans localStorage.
 */
export function useHelpMode() {
  return useHelpModeContext();
}
