'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import dynamic from 'next/dynamic';
import type Konva from 'konva';
import { useAuth } from '@/features/auth/auth-provider';
import { useTranslation } from '@/i18n';
import {
  fetchBoardDetail,
  fetchChildBoards,
  ensureChildBoard,
  type Board,
  type NodeChildBoard,
} from '@/features/boards/boards-api';
import type { MindmapNode, MindmapLayoutResult, LabelPlacement } from './mindmap/mindmap-types';
import { transformBoardToMindmapTree, transformSubBoardToNodes } from './mindmap/mindmap-transform';
import { computeRadialLayout, isNodeInViewport } from './mindmap/mindmap-layout';
import { computeLabelPlacements } from './mindmap/mindmap-labels';
import { buildTransition, tickTransition } from './mindmap/mindmap-animation';
import { ZoomIn, ZoomOut, Maximize2, ChevronsUpDown } from 'lucide-react';

// ---------------------------------------------------------------------------
// Dynamic imports for Konva (SSR-incompatible)
// ---------------------------------------------------------------------------

const Stage = dynamic(
  () => import('react-konva').then(mod => mod.Stage),
  { ssr: false },
) as unknown as typeof import('react-konva').Stage;

const Layer = dynamic(
  () => import('react-konva').then(mod => mod.Layer),
  { ssr: false },
) as unknown as typeof import('react-konva').Layer;

// SSR-safe lazy imports for layer components
const MindmapEdgesLayer = dynamic(
  () => import('./mindmap/MindmapEdgesLayer').then(mod => ({ default: mod.MindmapEdgesLayer })),
  { ssr: false },
) as unknown as typeof import('./mindmap/MindmapEdgesLayer').MindmapEdgesLayer;

const MindmapNodesLayer = dynamic(
  () => import('./mindmap/MindmapNodesLayer').then(mod => ({ default: mod.MindmapNodesLayer })),
  { ssr: false },
) as unknown as typeof import('./mindmap/MindmapNodesLayer').MindmapNodesLayer;

const MindmapLabelsLayer = dynamic(
  () => import('./mindmap/MindmapLabelsLayer').then(mod => ({ default: mod.MindmapLabelsLayer })),
  { ssr: false },
) as unknown as typeof import('./mindmap/MindmapLabelsLayer').MindmapLabelsLayer;

// ---------------------------------------------------------------------------
// localStorage helpers (versioned keys)
// ---------------------------------------------------------------------------

const STORAGE_VERSION = 'v1';

function saveMindmapCollapsed(boardId: string, collapsedIds: Set<string>): void {
  try {
    const key = `stratum:board:${boardId}:mindmap-collapsed:${STORAGE_VERSION}`;
    localStorage.setItem(key, JSON.stringify([...collapsedIds]));
  } catch { /* ignore */ }
}

function loadMindmapCollapsed(boardId: string): Set<string> {
  try {
    const key = `stratum:board:${boardId}:mindmap-collapsed:${STORAGE_VERSION}`;
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v: unknown): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function saveMindmapViewport(boardId: string, pos: { x: number; y: number }, scale: number): void {
  try {
    const key = `stratum:board:${boardId}:mindmap-viewport:${STORAGE_VERSION}`;
    localStorage.setItem(key, JSON.stringify({ x: pos.x, y: pos.y, scale }));
  } catch { /* ignore */ }
}

function loadMindmapViewport(boardId: string): { x: number; y: number; scale: number } | null {
  try {
    const key = `stratum:board:${boardId}:mindmap-viewport:${STORAGE_VERSION}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj.x !== 'number' || typeof obj.y !== 'number' || typeof obj.scale !== 'number') return null;
    return obj;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// useContainerSize hook
// ---------------------------------------------------------------------------

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    // Set initial size
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

// ---------------------------------------------------------------------------
// Clamp utility
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BoardMindmapViewProps {
  board: Board;
  childBoards: Record<string, NodeChildBoard>;
  onOpenTask: (nodeId: string) => void;
  onOpenChildBoard: (boardId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BoardMindmapView({
  board,
  childBoards,
  onOpenTask,
  onOpenChildBoard,
}: BoardMindmapViewProps) {
  const { accessToken } = useAuth();
  const { t } = useTranslation('board');
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const nodeRefsMap = useRef(new Map<string, Konva.Group>());
  const edgeRefsMap = useRef(new Map<string, Konva.Path>());
  const prevLayoutRef = useRef<MindmapNode[]>([]);
  const transitionRef = useRef<ReturnType<typeof buildTransition> | null>(null);

  const { width: containerWidth, height: containerHeight } = useContainerSize(containerRef);

  // --- State ---
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => loadMindmapCollapsed(board.id));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [loadedSubtrees, setLoadedSubtrees] = useState<Map<string, MindmapNode[]>>(new Map());
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // Restore viewport from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const saved = loadMindmapViewport(board.id);
    if (saved) {
      setStagePos({ x: saved.x, y: saved.y });
      setStageScale(saved.scale);
    }
  }, [board.id]);

  // Persist collapsed/viewport on change
  useEffect(() => {
    saveMindmapCollapsed(board.id, collapsedIds);
  }, [board.id, collapsedIds]);

  useEffect(() => {
    saveMindmapViewport(board.id, stagePos, stageScale);
  }, [board.id, stagePos, stageScale]);

  // --- Layout (pure TS) ---
  const mindmapNodes = useMemo(
    () => transformBoardToMindmapTree(board, childBoards, loadedSubtrees, collapsedIds),
    [board, childBoards, loadedSubtrees, collapsedIds],
  );

  const layoutResult: MindmapLayoutResult = useMemo(
    () => computeRadialLayout(mindmapNodes),
    [mindmapNodes],
  );

  // --- Labels ---
  const labelPlacements: LabelPlacement[] = useMemo(
    () => computeLabelPlacements(layoutResult.nodes),
    [layoutResult.nodes],
  );

  // --- Viewport culling ---
  const visibleNodes = useMemo(
    () => layoutResult.nodes.filter(n => isNodeInViewport(n, stagePos, stageScale, containerWidth, containerHeight)),
    [layoutResult.nodes, stagePos, stageScale, containerWidth, containerHeight],
  );

  // --- Animation: layout transition ---
  useEffect(() => {
    const oldNodes = prevLayoutRef.current;
    const newNodes = layoutResult.nodes;
    if (oldNodes.length > 0 && newNodes.length > 0) {
      const transition = buildTransition(oldNodes, newNodes, 350);
      transitionRef.current = transition;

      const nodesLayer = stageRef.current?.findOne('.nodes-layer') as Konva.Layer | null;
      const edgesLayer = stageRef.current?.findOne('.edges-layer') as Konva.Layer | null;

      tickTransition(
        transition,
        nodeRefsMap.current,
        edgeRefsMap.current,
        layoutResult.edges,
        nodesLayer,
        edgesLayer,
        () => { transitionRef.current = null; },
      );
    }
    prevLayoutRef.current = newNodes;
  }, [layoutResult]);

  // --- Navigate child board: resolve nodeId → boardId ---
  const handleNavigateChild = useCallback((nodeId: string) => {
    const childBoard = childBoards[nodeId];
    if (childBoard) {
      onOpenChildBoard(childBoard.boardId);
    }
  }, [childBoards, onOpenChildBoard]);

  // --- Pan/Zoom ---
  const syncStateRafRef = useRef(0);

  const syncViewportToState = useCallback(() => {
    cancelAnimationFrame(syncStateRafRef.current);
    syncStateRafRef.current = requestAnimationFrame(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setStagePos({ x: stage.x(), y: stage.y() });
      setStageScale(stage.scaleX());
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    syncViewportToState();
  }, [syncViewportToState]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = stage.scaleX();
    const direction = e.evt.deltaY < 0 ? 1 : -1;
    const newScale = clamp(oldScale * (1 + direction * 0.1), 0.1, 3.0);

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scaleX(newScale);
    stage.scaleY(newScale);
    stage.x(pointer.x - mousePointTo.x * newScale);
    stage.y(pointer.y - mousePointTo.y * newScale);
    stage.batchDraw();

    syncViewportToState();
  }, [syncViewportToState]);

  // --- Expand/collapse ---
  const expandControllersRef = useRef(new Map<string, AbortController>());

  useEffect(() => {
    return () => {
      for (const controller of expandControllersRef.current.values()) {
        controller.abort();
      }
      expandControllersRef.current.clear();
    };
  }, [board.id]);

  const expandNode = useCallback(async (nodeId: string) => {
    if (!accessToken) return;

    const existing = expandControllersRef.current.get(nodeId);
    if (existing) existing.abort();

    const controller = new AbortController();
    expandControllersRef.current.set(nodeId, controller);

    try {
      setLoadingNodeIds(prev => new Set(prev).add(nodeId));

      const boardId = await ensureChildBoard(nodeId, accessToken);
      if (controller.signal.aborted) return;

      const boardDetail = await fetchBoardDetail(boardId, accessToken);
      if (controller.signal.aborted || !boardDetail) return;

      const childBoardsData: Record<string, NodeChildBoard> = {};
      const childBoardsList = await fetchChildBoards(boardDetail.nodeId, accessToken);
      if (controller.signal.aborted) return;
      for (const cb of childBoardsList) {
        childBoardsData[cb.nodeId] = cb;
      }

      const subtreeNodes = transformSubBoardToNodes(nodeId, boardDetail, childBoardsData);
      setLoadedSubtrees(prev => new Map(prev).set(nodeId, subtreeNodes));
      setCollapsedIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error(`Failed to expand node ${nodeId}:`, err);
    } finally {
      expandControllersRef.current.delete(nodeId);
      setLoadingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  }, [accessToken]);

  const requestExpand = useCallback((nodeId: string) => {
    const isCollapsed = collapsedIds.has(nodeId);
    if (isCollapsed) {
      // If subtree already loaded, just uncollapse
      if (loadedSubtrees.has(nodeId)) {
        setCollapsedIds(prev => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      } else {
        expandNode(nodeId);
      }
    } else {
      // Collapse
      const controller = expandControllersRef.current.get(nodeId);
      if (controller) {
        controller.abort();
        expandControllersRef.current.delete(nodeId);
      }
      setCollapsedIds(prev => new Set(prev).add(nodeId));
    }
  }, [collapsedIds, loadedSubtrees, expandNode]);

  // --- Toolbar actions ---
  const adjustZoom = useCallback((delta: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const newScale = clamp(stageScale + delta, 0.1, 3.0);
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;
    const mousePointTo = {
      x: (cx - stagePos.x) / stageScale,
      y: (cy - stagePos.y) / stageScale,
    };
    setStageScale(newScale);
    setStagePos({
      x: cx - mousePointTo.x * newScale,
      y: cy - mousePointTo.y * newScale,
    });
  }, [stageScale, stagePos, containerWidth, containerHeight]);

  const fitToContent = useCallback(() => {
    const { bounds } = layoutResult;
    const PADDING = 40;
    const contentWidth = bounds.maxX - bounds.minX + PADDING * 2;
    const contentHeight = bounds.maxY - bounds.minY + PADDING * 2;
    if (contentWidth <= 0 || contentHeight <= 0) return;
    const scaleX = containerWidth / contentWidth;
    const scaleY = containerHeight / contentHeight;
    const newScale = clamp(Math.min(scaleX, scaleY), 0.1, 3.0);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    setStageScale(newScale);
    setStagePos({
      x: containerWidth / 2 - centerX * newScale,
      y: containerHeight / 2 - centerY * newScale,
    });
  }, [layoutResult, containerWidth, containerHeight]);

  const collapseAll = useCallback(() => {
    const ids = mindmapNodes.filter(n => n.hasChildren).map(n => n.id);
    setCollapsedIds(new Set(ids));
  }, [mindmapNodes]);

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  // --- Hover ---
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onNodeHoverStart = useCallback((nodeId: string) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setHoveredNodeId(nodeId), 400);
  }, []);

  const onNodeHoverEnd = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    setHoveredNodeId(null);
  }, []);

  // --- Ref registration ---
  const registerNodeRef = useCallback((nodeId: string, ref: Konva.Group | null) => {
    if (ref) nodeRefsMap.current.set(nodeId, ref);
    else nodeRefsMap.current.delete(nodeId);
  }, []);

  const registerEdgeRef = useCallback((key: string, ref: Konva.Path | null) => {
    if (ref) edgeRefsMap.current.set(key, ref);
    else edgeRefsMap.current.delete(key);
  }, []);

  // --- Keyboard navigation ---
  useEffect(() => {
    const container = stageRef.current?.container();
    if (!container) return;
    container.tabIndex = 0;
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', t('mindmap.ariaLabel'));
  }, [mounted, t]);

  // Auto fit on first mount with content
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (!hasFittedRef.current && containerWidth > 0 && containerHeight > 0 && layoutResult.nodes.length > 0) {
      const saved = loadMindmapViewport(board.id);
      if (!saved) {
        fitToContent();
      }
      hasFittedRef.current = true;
    }
  }, [containerWidth, containerHeight, layoutResult.nodes.length, board.id, fitToContent]);

  // --- Tooltip data ---
  const hoveredNode = hoveredNodeId ? layoutResult.nodes.find(n => n.id === hoveredNodeId) : null;
  const tooltipScreenPos = hoveredNode
    ? { x: hoveredNode.x * stageScale + stagePos.x, y: hoveredNode.y * stageScale + stagePos.y }
    : null;

  if (!mounted) {
    return (
      <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-card/60">
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0f1117]">
      {containerWidth > 0 && containerHeight > 0 && (
        <Stage
          ref={stageRef}
          width={containerWidth}
          height={containerHeight}
          draggable
          x={stagePos.x}
          y={stagePos.y}
          scaleX={stageScale}
          scaleY={stageScale}
          onDragEnd={handleDragEnd}
          onWheel={handleWheel}
          style={{ cursor: 'grab' }}
        >
          {/* Layer 1: Edges — non-interactive */}
          <Layer name="edges-layer" listening={false}>
            <MindmapEdgesLayer
              edges={layoutResult.edges}
              nodes={layoutResult.nodes}
              registerEdgeRef={registerEdgeRef}
            />
          </Layer>

          {/* Layer 2: Nodes — interactive */}
          <Layer name="nodes-layer">
            <MindmapNodesLayer
              nodes={visibleNodes}
              selectedId={selectedNodeId}
              loadingIds={loadingNodeIds}
              onSelect={setSelectedNodeId}
              onExpand={requestExpand}
              onOpenTask={onOpenTask}
              onNavigateChild={handleNavigateChild}
              onHoverStart={onNodeHoverStart}
              onHoverEnd={onNodeHoverEnd}
              registerRef={registerNodeRef}
            />
          </Layer>

          {/* Layer 3: Labels — conditional on zoom, non-interactive */}
          {stageScale >= 0.5 && (
            <Layer listening={false}>
              <MindmapLabelsLayer
                placements={labelPlacements}
                nodes={visibleNodes}
              />
            </Layer>
          )}
        </Stage>
      )}

      {/* Tooltip (DOM, above canvas) */}
      {hoveredNode && tooltipScreenPos && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-xl border border-white/10 bg-surface/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"
          style={{
            left: tooltipScreenPos.x + 20,
            top: tooltipScreenPos.y - 10,
          }}
        >
          <p className="font-semibold text-foreground truncate">{hoveredNode.title}</p>
          <div className="mt-1 flex items-center gap-2 text-muted">
            {hoveredNode.priority !== 'NONE' && <span>{t(`mindmap.priority.${hoveredNode.priority}`)}</span>}
            {hoveredNode.effort && <span>{hoveredNode.effort}</span>}
          </div>
          {hoveredNode.progress > 0 && (
            <div className="mt-1.5">
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${hoveredNode.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-muted">{hoveredNode.progress}%</span>
            </div>
          )}
          {hoveredNode.assignees.length > 0 && (
            <p className="mt-1 text-muted truncate">
              {hoveredNode.assignees.map(a => a.displayName).join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Toolbar (DOM) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-full border border-white/10 bg-surface/90 px-2 py-1 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={() => adjustZoom(0.2)}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.zoomIn')}
        >
          <ZoomIn size={16} />
        </button>
        <button
          type="button"
          onClick={() => adjustZoom(-0.2)}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.zoomOut')}
        >
          <ZoomOut size={16} />
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={fitToContent}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.fitToContent')}
        >
          <Maximize2 size={16} />
        </button>
        <button
          type="button"
          onClick={expandAll}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.expandAll')}
        >
          <ChevronsUpDown size={16} />
        </button>
        <button
          type="button"
          onClick={collapseAll}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.collapseAll')}
        >
          <ChevronsUpDown size={16} className="rotate-90" />
        </button>
      </div>

      {/* a11y live region */}
      <div role="status" aria-live="polite" className="sr-only">
        {selectedNodeId && (() => {
          const node = layoutResult.nodes.find(n => n.id === selectedNodeId);
          return node ? t('mindmap.nodeSelected', { title: node.title, depth: node.depth }) : null;
        })()}
      </div>
    </div>
  );
}
