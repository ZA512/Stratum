"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

interface BoardDataContextValue {
  teamId: string | null;
  activeBoardId: string | null;
  board: Board | null;
  breadcrumb: NodeBreadcrumbItem[];
  childBoards: Record<string, NodeChildBoard>;
  status: "idle" | "loading" | "ready" | "error";
  isFetching: boolean;
  transitionPhase: "idle" | "pushing" | "settling";
  transitionDirection: "descend" | null;
  error: string | null;
  setActiveBoardId: (id: string | null) => void;
  prefetchBoard: (id: string) => Promise<void>;
  openChildBoard: (boardId: string) => void;
  refreshActiveBoard: () => Promise<void>;
  refreshArchivedNodesForColumn?: (columnId: string) => Promise<void>;
  registerDescendTrigger: (fn: (href: string, options?: { skipNavigate?: boolean }) => void) => void;
}

const BoardDataContext = createContext<BoardDataContextValue | null>(null);

const childBoardsToMap = (entries: NodeChildBoard[] | undefined | null) => {
  const map: Record<string, NodeChildBoard> = {};
  if (!entries) return map;
  for (const entry of entries) {
    map[entry.nodeId] = entry;
  }
  return map;
};

export function BoardDataProvider({ children }: { children: React.ReactNode }) {
  const TRANSITION_MS = 520;
  const router = useRouter();
  const params = useParams<{ teamId: string; board?: string[] }>();
  const { accessToken, initializing } = useAuth();
  const queryClient = useQueryClient();
  const teamId = params?.teamId ?? null;
  const routeBoardId = params?.board && params.board.length > 0 ? params.board[0] : null;
  const [activeBoardId, setActiveBoardId] = useState<string | null>(routeBoardId);
  const [rootError, setRootError] = useState<string | null>(null);
  const descendTriggerRef = useRef<((href: string, options?: { skipNavigate?: boolean }) => void) | null>(null);
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "pushing" | "settling">("idle");
  const [transitionDirection, setTransitionDirection] = useState<"descend" | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActiveBoardId(routeBoardId);
  }, [routeBoardId]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  const getBoardDetailCached = useCallback(
    async (boardId: string) => {
      if (!accessToken) return null;
      const fetched = await fetchBoardDetail(boardId, accessToken);
      if (fetched) return fetched;
      return queryClient.getQueryData<Board>(["board", boardId]) ?? null;
    },
    [accessToken, queryClient],
  );

  useEffect(() => {
    if (!teamId) return;
    if (activeBoardId) return;
    if (initializing) return;
    if (!accessToken) return;
    let cancelled = false;
    setRootError(null);
    (async () => {
      try {
        const root = await queryClient.fetchQuery({
          queryKey: ["root-board", teamId],
          queryFn: () => fetchRootBoard(teamId, accessToken),
          staleTime: 60_000,
        });
        if (cancelled) return;
        if (root?.id) setActiveBoardId(root.id);
      } catch (err) {
        if (!cancelled) {
          setRootError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, activeBoardId, initializing, accessToken, queryClient]);

  const boardQuery = useQuery({
    queryKey: ["board", activeBoardId],
    queryFn: () => (activeBoardId ? getBoardDetailCached(activeBoardId) : null),
    enabled: Boolean(activeBoardId && accessToken && !initializing),
    staleTime: 20_000,
  });

  const board = boardQuery.data ?? null;
  const nodeId = board?.nodeId ?? null;

  const breadcrumbQuery = useQuery({
    queryKey: ["breadcrumb", nodeId],
    queryFn: () => fetchNodeBreadcrumb(nodeId!, accessToken!),
    enabled: Boolean(nodeId && accessToken),
    staleTime: 20_000,
  });

  const childBoardsQuery = useQuery({
    queryKey: ["child-boards", nodeId],
    queryFn: () => fetchChildBoards(nodeId!, accessToken!),
    enabled: Boolean(nodeId && accessToken),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (!boardQuery.error) return;
    if (!activeBoardId || !teamId || !accessToken) return;
    const status = (boardQuery.error as { status?: number } | undefined)?.status;
    const message = boardQuery.error instanceof Error
      ? boardQuery.error.message
      : String(boardQuery.error);
    const isForbidden = status === 403 || message.includes("Forbidden") || message.includes("personnel inaccessible");
    if (!isForbidden) return;

    (async () => {
      try {
        const root = await queryClient.fetchQuery({
          queryKey: ["root-board", teamId],
          queryFn: () => fetchRootBoard(teamId, accessToken),
          staleTime: 60_000,
        });
        if (root?.id && root.id !== activeBoardId) {
          router.replace(`/boards/${teamId}/${root.id}`);
        }
      } catch {
        // ignore: will retry on next render cycle
      }
    })();
  }, [boardQuery.error, activeBoardId, teamId, accessToken, queryClient, router]);

  const breadcrumb = useMemo(
    () => breadcrumbQuery.data ?? [],
    [breadcrumbQuery.data],
  );
  const childBoards = useMemo(
    () => childBoardsToMap(childBoardsQuery.data),
    [childBoardsQuery.data],
  );

  const error = useMemo(() => {
    const err = boardQuery.error ?? breadcrumbQuery.error ?? childBoardsQuery.error;
    if (err) return err instanceof Error ? err.message : String(err);
    return rootError;
  }, [boardQuery.error, breadcrumbQuery.error, childBoardsQuery.error, rootError]);

  const status = useMemo<"idle" | "loading" | "ready" | "error">(() => {
    if (!accessToken || initializing) return "idle";
    if (error) return "error";
    if (boardQuery.isLoading || breadcrumbQuery.isLoading || childBoardsQuery.isLoading) return "loading";
    if (board) return "ready";
    return "idle";
  }, [accessToken, initializing, error, boardQuery.isLoading, breadcrumbQuery.isLoading, childBoardsQuery.isLoading, board]);

  const isFetching = boardQuery.isFetching || breadcrumbQuery.isFetching || childBoardsQuery.isFetching;

  const prefetchBoard = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      try {
        const detail = await queryClient.fetchQuery({
          queryKey: ["board", id],
          queryFn: () => getBoardDetailCached(id),
          staleTime: 20_000,
        });
        const resolved = detail ?? queryClient.getQueryData<Board>(["board", id]);
        if (!resolved?.nodeId) return;
        await Promise.all([
          queryClient.prefetchQuery({
            queryKey: ["breadcrumb", resolved.nodeId],
            queryFn: () => fetchNodeBreadcrumb(resolved.nodeId, accessToken),
            staleTime: 20_000,
          }),
          queryClient.prefetchQuery({
            queryKey: ["child-boards", resolved.nodeId],
            queryFn: () => fetchChildBoards(resolved.nodeId, accessToken),
            staleTime: 20_000,
          }),
        ]);
      } catch {
        /* silent */
      }
    },
    [accessToken, getBoardDetailCached, queryClient],
  );

  useEffect(() => {
    if (!breadcrumb.length) return;
    for (const item of breadcrumb) {
      if (item.boardId) {
        void prefetchBoard(item.boardId);
      }
    }
  }, [breadcrumb, prefetchBoard]);

  const refreshActiveBoard = useCallback(async () => {
    if (!activeBoardId) return;
    await queryClient.invalidateQueries({ queryKey: ["board", activeBoardId] });
    await queryClient.refetchQueries({ queryKey: ["board", activeBoardId] });
    const current = queryClient.getQueryData<Board>(["board", activeBoardId]);
    if (current?.nodeId) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["breadcrumb", current.nodeId] }),
        queryClient.invalidateQueries({ queryKey: ["child-boards", current.nodeId] }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["breadcrumb", current.nodeId] }),
        queryClient.refetchQueries({ queryKey: ["child-boards", current.nodeId] }),
      ]);
    }
  }, [activeBoardId, queryClient]);

  const openChildBoard = useCallback(
    (boardId: string) => {
      if (!teamId || !boardId) return;
      void prefetchBoard(boardId);
      const href = `/boards/${teamId}/${boardId}`;
      if (descendTriggerRef.current) {
        setTransitionPhase("pushing");
        setTransitionDirection("descend");
        descendTriggerRef.current(href, { skipNavigate: true });
        if (transitionTimerRef.current !== null) {
          window.clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = window.setTimeout(() => {
          setTransitionPhase("settling");
          router.push(href);
        }, TRANSITION_MS);
      } else {
        router.push(href);
      }
    },
    [prefetchBoard, teamId, router],
  );

  const registerDescendTrigger = useCallback((fn: (href: string, options?: { skipNavigate?: boolean }) => void) => {
    descendTriggerRef.current = fn;
  }, []);

  useEffect(() => {
    if (transitionPhase !== "settling") return;
    if (!board || !activeBoardId) return;
    setTransitionPhase("idle");
    setTransitionDirection(null);
  }, [transitionPhase, board, activeBoardId]);

  const value: BoardDataContextValue = useMemo(
    () => ({
      teamId,
      activeBoardId,
      board,
      breadcrumb,
      childBoards,
      status,
      isFetching,
      transitionPhase,
      transitionDirection,
      error,
      setActiveBoardId,
      prefetchBoard,
      openChildBoard,
      refreshActiveBoard,
      registerDescendTrigger,
    }),
    [
      teamId,
      activeBoardId,
      board,
      breadcrumb,
      childBoards,
      status,
      isFetching,
      transitionPhase,
      transitionDirection,
      error,
      prefetchBoard,
      openChildBoard,
      refreshActiveBoard,
      registerDescendTrigger,
    ],
  );

  return <BoardDataContext.Provider value={value}>{children}</BoardDataContext.Provider>;
}

export function useBoardData(): BoardDataContextValue {
  const ctx = useContext(BoardDataContext);
  if (!ctx) throw new Error("useBoardData must be used within BoardDataProvider");
  return ctx;
}
