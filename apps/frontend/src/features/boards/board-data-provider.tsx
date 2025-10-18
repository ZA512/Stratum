"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import {
  fetchBoardDetail,
  fetchChildBoards,
  fetchNodeBreadcrumb,
  fetchRootBoard,
  type Board,
  type NodeBreadcrumbItem,
  type NodeChildBoard,
} from "@/features/boards/boards-api";

interface BoardCaches {
  boards: Map<string, Board>;
  breadcrumbs: Map<string, NodeBreadcrumbItem[]>;
  childBoards: Map<string, Record<string, NodeChildBoard>>;
}

interface BoardDataContextValue {
  teamId: string | null;
  activeBoardId: string | null;
  board: Board | null;
  breadcrumb: NodeBreadcrumbItem[];
  childBoards: Record<string, NodeChildBoard>;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  setActiveBoardId: (id: string | null) => void;
  prefetchBoard: (id: string) => Promise<void>;
  openChildBoard: (boardId: string) => void;
  refreshActiveBoard: () => Promise<void>;
  refreshArchivedNodesForColumn?: (columnId: string) => Promise<void>;
  registerDescendTrigger: (fn: (href: string) => void) => void;
}

const BoardDataContext = createContext<BoardDataContextValue | null>(null);

export function BoardDataProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ teamId: string; board?: string[] }>();
  const { accessToken } = useAuth();
  const teamId = params?.teamId ?? null;
  const routeBoardId = params?.board && params.board.length > 0 ? params.board[0] : null;

  const cachesRef = useRef<BoardCaches>({
    boards: new Map(),
    breadcrumbs: new Map(),
    childBoards: new Map(),
  });

  const descendTriggerRef = useRef<((href: string) => void) | null>(null);

  const [activeBoardId, setActiveBoardId] = useState<string | null>(routeBoardId);
  const [board, setBoard] = useState<Board | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<NodeBreadcrumbItem[]>([]);
  const [childBoards, setChildBoards] = useState<Record<string, NodeChildBoard>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Sync activeBoardId with route changes
  useEffect(() => {
    setActiveBoardId(routeBoardId);
  }, [routeBoardId]);

  // Resolve root board if none specified
  useEffect(() => {
    if (!teamId) return;
    if (activeBoardId) return; // already determined
    let cancelled = false;
    (async () => {
      try {
        setStatus("loading");
        const root = await fetchRootBoard(teamId, accessToken || "");
        if (cancelled) return;
        cachesRef.current.boards.set(root.id, root);
        // Affiche immédiatement un placeholder (root sans nodes) pour éviter flash.
        setBoard((prev) => prev ?? root);
        setActiveBoardId(root.id);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [teamId, activeBoardId, accessToken]);

  const loadBoardBundle = useCallback(async (boardId: string) => {
    // Use cache if present
    const cached = cachesRef.current.boards.get(boardId);
    if (cached) {
      setBoard(cached);
      if (cached.nodeId) {
        const bc = cachesRef.current.breadcrumbs.get(cached.nodeId);
        if (bc) setBreadcrumb(bc);
        const ch = cachesRef.current.childBoards.get(cached.nodeId);
        if (ch) setChildBoards(ch);
      }
    }
    try {
      setStatus(cached ? "ready" : "loading");
      const detail = await fetchBoardDetail(boardId, accessToken || "");
      
      // Si detail est null, cela signifie 304 Not Modified (pas de changement)
      // On garde le cache actuel et on ne met rien à jour
      if (detail === null) {
        setStatus("ready");
        return;
      }
      
      cachesRef.current.boards.set(boardId, detail);
      if (detail.nodeId) {
        const [breadcrumbItems, childEntries] = await Promise.all([
          fetchNodeBreadcrumb(detail.nodeId, accessToken || ""),
          fetchChildBoards(detail.nodeId, accessToken || ""),
        ]);
        cachesRef.current.breadcrumbs.set(detail.nodeId, breadcrumbItems);
        const map: Record<string, NodeChildBoard> = {};
        for (const entry of childEntries) map[entry.nodeId] = entry;
        cachesRef.current.childBoards.set(detail.nodeId, map);
        // Update visible state only after all ready to minimize flicker
        setBoard(detail);
        setBreadcrumb(breadcrumbItems);
        setChildBoards(map);
        setStatus("ready");
        setError(null);
      } else {
        setBoard(detail);
        setBreadcrumb([]);
        setChildBoards({});
        setStatus("ready");
      }
    } catch (err) {
      setError((err as Error).message);
      if (!cached) setStatus("error");
    }
  }, [accessToken]);

  // Load when activeBoardId changes
  useEffect(() => {
    if (!activeBoardId) return;
    loadBoardBundle(activeBoardId);
  }, [activeBoardId, loadBoardBundle]);

  const prefetchBoard = useCallback(async (id: string) => {
    if (cachesRef.current.boards.has(id)) return;
    try {
      const detail = await fetchBoardDetail(id, accessToken || "");
      
      // Si null (304 Not Modified), on ne fait rien
      if (detail === null) return;
      
      cachesRef.current.boards.set(id, detail);
      if (detail.nodeId) {
        const [breadcrumbItems, childEntries] = await Promise.all([
          fetchNodeBreadcrumb(detail.nodeId, accessToken || ""),
          fetchChildBoards(detail.nodeId, accessToken || ""),
        ]);
        cachesRef.current.breadcrumbs.set(detail.nodeId, breadcrumbItems);
        const map: Record<string, NodeChildBoard> = {};
        for (const entry of childEntries) map[entry.nodeId] = entry;
        cachesRef.current.childBoards.set(detail.nodeId, map);
      }
    } catch {
      /* silent */
    }
  }, [accessToken]);

  // Prefetch ancêtres du breadcrumb pour remontées instantanées.
  useEffect(() => {
    if (!breadcrumb.length) return;
    for (const item of breadcrumb) {
      if (item.boardId && !cachesRef.current.boards.has(item.boardId)) {
        prefetchBoard(item.boardId);
      }
    }
  }, [breadcrumb, prefetchBoard]);

  const refreshActiveBoard = useCallback(async () => {
    if (!activeBoardId) return;
    await loadBoardBundle(activeBoardId);
  }, [activeBoardId, loadBoardBundle]);

  const openChildBoard = useCallback((boardId: string) => {
    if (!teamId || !boardId) return;
    prefetchBoard(boardId); // warm
    const href = `/boards/${teamId}/${boardId}`;
    if (descendTriggerRef.current) {
      descendTriggerRef.current(href);
    } else {
      router.push(href);
    }
  }, [prefetchBoard, teamId, router]);

  const registerDescendTrigger = useCallback((fn: (href: string) => void) => {
    descendTriggerRef.current = fn;
  }, []);

  const value: BoardDataContextValue = useMemo(() => ({
    teamId,
    activeBoardId,
    board,
    breadcrumb,
    childBoards,
    status,
    error,
    setActiveBoardId,
    prefetchBoard,
    openChildBoard,
    refreshActiveBoard,
    registerDescendTrigger,
  }), [teamId, activeBoardId, board, breadcrumb, childBoards, status, error, prefetchBoard, openChildBoard, refreshActiveBoard, registerDescendTrigger]);

  return <BoardDataContext.Provider value={value}>{children}</BoardDataContext.Provider>;
}

export function useBoardData(): BoardDataContextValue {
  const ctx = useContext(BoardDataContext);
  if (!ctx) throw new Error("useBoardData must be used within BoardDataProvider");
  return ctx;
}
