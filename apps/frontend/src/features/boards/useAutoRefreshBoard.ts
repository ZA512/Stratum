"use client";

import { useEffect, useRef } from 'react';

interface UseAutoRefreshBoardOptions {
  /**
   * Intervalle de polling en millisecondes (défaut: 15000 = 15 secondes)
   */
  intervalMs?: number;
  
  /**
   * Fonction de rafraîchissement à appeler
   */
  onRefresh: () => Promise<void>;
  
  /**
   * Activer ou désactiver le polling (défaut: true)
   */
  enabled?: boolean;
  
  /**
   * ID du board actif (pour détecter les changements)
   */
  boardId: string | null;
}

/**
 * Hook pour rafraîchir automatiquement le board en arrière-plan de manière optimisée.
 * 
 * Fonctionnalités :
 * - ✅ Polling automatique toutes les 15 secondes (configurable)
 * - ✅ Arrêt complet du polling si l'onglet n'est pas visible
 * - ✅ Rafraîchissement immédiat et discret quand l'utilisateur revient sur l'onglet après >15 sec
 * - ✅ Nettoyage automatique des timers
 * - ✅ Pas de requêtes inutiles (gestion intelligente de la visibilité)
 * 
 * @example
 * ```tsx
 * useAutoRefreshBoard({
 *   intervalMs: 15000,
 *   onRefresh: refreshActiveBoard,
 *   enabled: true,
 *   boardId: activeBoardId,
 * });
 * ```
 */
export function useAutoRefreshBoard({
  intervalMs = 15000,
  onRefresh,
  enabled = true,
  boardId,
}: UseAutoRefreshBoardOptions) {
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshTimeRef = useRef<number>(Date.now());
  const isRefreshingRef = useRef<boolean>(false);

  useEffect(() => {
    // Si désactivé ou pas de board, ne rien faire
    if (!enabled || !boardId) {
      return;
    }

    // Fonction de rafraîchissement sécurisée (évite les appels concurrents)
    const safeRefresh = async () => {
      if (isRefreshingRef.current) return;
      
      isRefreshingRef.current = true;
      try {
        await onRefresh();
        lastRefreshTimeRef.current = Date.now();
      } catch {
        // Silent: critical errors are handled by the board-data-provider
      } finally {
        isRefreshingRef.current = false;
      }
    };

    // Démarrer le polling
    const startPolling = () => {
      // Nettoyer l'ancien intervalle s'il existe
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
      }

      // Créer un nouveau cycle de polling
      intervalIdRef.current = setInterval(() => {
        // Vérifier si l'onglet est visible avant de rafraîchir
        if (document.visibilityState === 'visible') {
          void safeRefresh();
        }
      }, intervalMs);
    };

    // Arrêter le polling
    const stopPolling = () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };

    // Gestionnaire de changement de visibilité
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // L'utilisateur revient sur l'onglet
        const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
        
        // Si ça fait plus de 15 secondes, rafraîchir immédiatement
        if (timeSinceLastRefresh > intervalMs) {
          void safeRefresh();
        }
        
        // Redémarrer le polling
        startPolling();
      } else {
        // L'utilisateur quitte l'onglet -> arrêter le polling pour économiser les ressources
        stopPolling();
      }
    };

    // Démarrer le polling initial si l'onglet est visible
    if (document.visibilityState === 'visible') {
      startPolling();
    }

    // Écouter les changements de visibilité
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Nettoyage
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, boardId, intervalMs, onRefresh]);
}
