"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { NodeDetail } from '../types';
import { fetchNodeDetail } from '../nodes-api';
import { useAuth } from '@/features/auth/auth-provider';

export type TaskDrawerState = {
  openedNodeId: string | null;
  detail: NodeDetail | null;
  loading: boolean;
  error: string | null;
  open: (nodeId: string) => void;
  close: () => void;
  refresh: () => void;
  prefetch: (nodeId: string) => void;
  applyDetail: (next: NodeDetail) => void;
};

const Ctx = createContext<TaskDrawerState | null>(null);

export const TaskDrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openedNodeId, setOpenedNodeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Map<string, { detail: NodeDetail; fetchedAt: number }>>(new Map());
  const currentReqRef = useRef<string | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const { accessToken } = useAuth();

  const TTL = 60_000; // 60s

  const load = useCallback(async (nodeId: string, opts: { background?: boolean } = {}) => {
    if (!accessToken) return;
    const cached = cacheRef.current.get(nodeId);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < TTL && !opts.background) {
      setDetail(cached.detail);
      return;
    }
    if (!opts.background) {
      setLoading(true);
      setError(null);
    }
    currentReqRef.current = nodeId;
    try {
      const data = await fetchNodeDetail(nodeId, accessToken);
      cacheRef.current.set(nodeId, { detail: data, fetchedAt: Date.now() });
      if (currentReqRef.current === nodeId) {
        if (!opts.background) setDetail(data);
      }
      if (opts.background && openedNodeId === nodeId) {
        // refresh visible
        setDetail(data);
      }
    } catch (e) {
      if (!opts.background) {
        const msg = e instanceof Error ? e.message : 'Erreur de chargement';
        setError(msg);
      }
    } finally {
      if (!opts.background) setLoading(false);
    }
  }, [accessToken, openedNodeId]);

  const open = useCallback((nodeId: string) => {
    setOpenedNodeId(nodeId);
    const cached = cacheRef.current.get(nodeId);
    if (cached) {
      setDetail(cached.detail);
      // background refresh
      void load(nodeId, { background: true });
    } else {
      setDetail(null);
      void load(nodeId);
    }
  }, [load]);

  const close = useCallback(() => {
    setOpenedNodeId(null);
    setDetail(null);
    setError(null);
    // restore focus
    if (lastTriggerRef.current) {
      setTimeout(() => lastTriggerRef.current?.focus(), 0);
    }
  }, []);

  const refresh = useCallback(() => {
    // Forcer un fetch en mode background pour ignorer le cache et pousser un detail frais
    if (openedNodeId) void load(openedNodeId, { background: true });
  }, [openedNodeId, load]);

  const applyDetail = useCallback((next: NodeDetail) => {
    // Mettre a jour le cache et l'etat pour le node courant
    if (!next?.id) return;
    cacheRef.current.set(next.id, { detail: next, fetchedAt: Date.now() });
    if (openedNodeId === next.id) {
      setDetail(next);
    }
  }, [openedNodeId]);

  const prefetch = useCallback((nodeId: string) => {
    if (!cacheRef.current.get(nodeId)) {
      void load(nodeId, { background: true });
    }
  }, [load]);

  // Ecouter les mouvements de carte pour mettre à jour la fiche sans reload
  useEffect(() => {
    const handler = (evt: Event) => {
      const custom = evt as CustomEvent<{ nodeId: string; targetColumnId: string }>;
      const movedId = custom?.detail?.nodeId;
      const targetColumnId = custom?.detail?.targetColumnId;
      if (!movedId || !targetColumnId) return;
      // Patch cache pour que la prochaine ouverture reflète immédiatement la bonne colonne
      const cached = cacheRef.current.get(movedId);
      if (cached) {
        cacheRef.current.set(movedId, {
          detail: { ...cached.detail, columnId: targetColumnId },
          fetchedAt: Date.now(),
        });
      }
      if (openedNodeId === movedId) {
        // Optimistic update en direct si la fiche est ouverte
        setDetail((prev) => (prev ? { ...prev, columnId: targetColumnId } : prev));
        // Rafraîchir en arrière-plan pour récupérer les settings de colonne à jour
        void load(movedId, { background: true });
      }
    };
    window.addEventListener('nodeMoved', handler as EventListener);
    return () => window.removeEventListener('nodeMoved', handler as EventListener);
  }, [openedNodeId, load]);

  return (
    <Ctx.Provider value={{ openedNodeId, detail, loading, error, open, close, refresh, prefetch, applyDetail }}>
      {children}
    </Ctx.Provider>
  );
};

export function useTaskDrawer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('TaskDrawerProvider manquant');
  return ctx;
}
