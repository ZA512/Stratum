import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchBoardActivity,
  fetchBoardActivityStats,
  fetchNodeActivity,
  type ActivityLog,
  type BoardActivityStats,
} from './activity-api';

/**
 * Hook pour récupérer les logs d'activité d'un board avec rafraîchissement automatique
 */
export function useBoardActivityLogs(
  boardId: string | undefined,
  accessToken: string | undefined,
  limit = 50,
) {
  const [data, setData] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetch = useCallback(async () => {
    if (!boardId || !accessToken) return;

    try {
      setIsLoading(true);
      const logs = await fetchBoardActivity(boardId, accessToken, limit);
      setData(logs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, accessToken, limit]);

  useEffect(() => {
    if (!boardId || !accessToken) return;

    // Chargement initial
    fetch();

    // Rafraîchissement toutes les 60 secondes
    intervalRef.current = setInterval(fetch, 60000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [boardId, accessToken, fetch]);

  return { data, isLoading, error, refetch: fetch };
}

/**
 * Hook pour récupérer les statistiques d'activité d'un board (compteur du jour)
 */
export function useBoardActivityStats(
  boardId: string | undefined,
  accessToken: string | undefined,
) {
  const [data, setData] = useState<BoardActivityStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetch = useCallback(async () => {
    if (!boardId || !accessToken) return;

    try {
      setIsLoading(true);
      const stats = await fetchBoardActivityStats(boardId, accessToken);
      setData(stats);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [boardId, accessToken]);

  useEffect(() => {
    if (!boardId || !accessToken) return;

    // Chargement initial
    fetch();

    // Rafraîchissement toutes les 2 minutes
    intervalRef.current = setInterval(fetch, 120000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [boardId, accessToken, fetch]);

  return { data, isLoading, error, refetch: fetch };
}

/**
 * Hook pour récupérer les logs d'activité d'une tâche spécifique
 */
export function useNodeActivityLogs(
  nodeId: string | undefined,
  accessToken: string | undefined,
) {
  const [data, setData] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!nodeId || !accessToken) return;

    try {
      setIsLoading(true);
      const logs = await fetchNodeActivity(nodeId, accessToken);
      setData(logs);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, accessToken]);

  useEffect(() => {
    if (!nodeId || !accessToken) return;
    fetch();
  }, [nodeId, accessToken, fetch]);

  return { data, isLoading, error, refetch: fetch };
}
