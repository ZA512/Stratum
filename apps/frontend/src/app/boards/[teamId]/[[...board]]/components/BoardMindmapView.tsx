'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';
import type Konva from 'konva';
import { Stage, Layer } from 'react-konva';
import { useAuth } from '@/features/auth/auth-provider';
import { useTranslation } from '@/i18n';
import {
  fetchBoardDetail,
  fetchChildBoards,
  ensureChildBoard,
  type Board,
  type NodeChildBoard,
} from '@/features/boards/boards-api';
import type { MindmapNode, MindmapLayoutResult, MindmapLayoutMode } from './mindmap/mindmap-types';
import { transformBoardToMindmapTree, transformSubBoardToNodes } from './mindmap/mindmap-transform';
import { computeMindmapLayout, isNodeInViewport } from './mindmap/mindmap-layout';
import { buildTransition, tickTransition } from './mindmap/mindmap-animation';
import { ZoomIn, ZoomOut, Maximize2, ChevronsUpDown, Home, ArrowUpLeft, Plus, Sparkles, Network, GitFork } from 'lucide-react';
import { type PhysicsNode, createPhysicsNode, tickAllPhysics, propagateDragToAncestors } from './mindmap/mindmap-physics';
import { computeBezierPath } from './mindmap/MindmapEdgesLayer';

import { MindmapEdgesLayer } from './mindmap/MindmapEdgesLayer';
import { MindmapNodesLayer } from './mindmap/MindmapNodesLayer';
import { useBoardFilters } from '../context/BoardFilterContext';

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

function loadMindmapCollapsed(boardId: string): Set<string> | null {
  try {
    const key = `stratum:board:${boardId}:mindmap-collapsed:${STORAGE_VERSION}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null; // first visit — signal default-collapsed behaviour
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return new Set(arr.filter((v: unknown): v is string => typeof v === 'string'));
  } catch {
    return null;
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

function saveLayoutMode(boardId: string, mode: MindmapLayoutMode): void {
  try {
    localStorage.setItem(`stratum:board:${boardId}:mindmap-layout-mode:v1`, mode);
  } catch { /* ignore */ }
}

function loadLayoutMode(boardId: string): MindmapLayoutMode {
  try {
    const raw = localStorage.getItem(`stratum:board:${boardId}:mindmap-layout-mode:v1`);
    if (raw === 'horizontal' || raw === 'radial') return raw;
  } catch { /* ignore */ }
  return 'horizontal';
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
  onOpenParentBoard?: () => void;
  hasParentBoard?: boolean;
  onCreateTask?: (title: string) => Promise<void>;
  onCreateChildTask?: (parentId: string, title: string) => Promise<void>;
  /** Filtre de statut controlé depuis l'extérieur (rightSlot du BoardFilterBar) */
  statusFilter?: Set<string>;
  onStatusFilterChange?: (filter: Set<string>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BoardMindmapView({
  board,
  childBoards,
  onOpenTask,
  onOpenChildBoard,
  onOpenParentBoard,
  hasParentBoard = false,
  onCreateTask,
  onCreateChildTask,
  statusFilter: externalStatusFilter,
  onStatusFilterChange,
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
  const [collapsedIds, setCollapsedIds] = useState<Set<string> | null>(() => loadMindmapCollapsed(board.id));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [loadedSubtrees, setLoadedSubtrees] = useState<Map<string, MindmapNode[]>>(new Map());
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
  const [layoutMode, setLayoutMode] = useState<MindmapLayoutMode>(() => loadLayoutMode(board.id));
  const [isBling, setIsBling] = useState(true);

  // --- Filters ---
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(['BACKLOG', 'IN_PROGRESS', 'BLOCKED']),
  );
  // searchQuery est piloté par le contexte partagé (BoardFilterBar) ;
  // le champ local du mindmap sert également de shortcut et reste en sync.
  const { filters: sharedFilters, setSearchQuery } = useBoardFilters();
  const searchQuery = sharedFilters.searchQuery;
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Si le statusFilter est contrôlé de l'extérieur, utiliser la valeur externe
  const effectiveStatusFilter = externalStatusFilter ?? statusFilter;
  const effectiveSetStatusFilter = onStatusFilterChange ?? setStatusFilter;

  // --- Bling physics ---
  const physicsRef = useRef<Map<string, PhysicsNode>>(new Map());
  const blingRafRef = useRef(0);
  const blingActiveRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  // Restore viewport from localStorage on mount
  useEffect(() => {
    setMounted(true);
  }, [board.id]);

  // Persist collapsed/viewport on change
  useEffect(() => {
    if (collapsedIds !== null) saveMindmapCollapsed(board.id, collapsedIds);
  }, [board.id, collapsedIds]);

  useEffect(() => {
    saveMindmapViewport(board.id, stagePos, stageScale);
  }, [board.id, stagePos, stageScale]);

  useEffect(() => {
    saveLayoutMode(board.id, layoutMode);
  }, [board.id, layoutMode]);

  // --- Layout (pure TS) ---
  const mindmapNodes = useMemo(
    () => transformBoardToMindmapTree(board, childBoards, loadedSubtrees, collapsedIds),
    [board, childBoards, loadedSubtrees, collapsedIds],
  );

  // Ref so async callbacks always see latest nodes
  const mindmapNodesRef = useRef(mindmapNodes);
  mindmapNodesRef.current = mindmapNodes;

  // Parent map ref (nodeId → parentId) for bling propagation
  const parentMapRef = useRef<Map<string, string | null>>(new Map());
  parentMapRef.current = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const n of mindmapNodes) m.set(n.id, n.parentId);
    return m;
  }, [mindmapNodes]);

  // Materialize null → explicit Set (null = all depth>0 collapsed)
  const materialize = useCallback((prev: Set<string> | null): Set<string> => {
    if (prev !== null) return new Set(prev);
    return new Set(mindmapNodesRef.current.filter(n => n.hasChildren && n.depth > 0).map(n => n.id));
  }, []);

  const layoutResult: MindmapLayoutResult = useMemo(
    () => computeMindmapLayout(mindmapNodes, layoutMode),
    [mindmapNodes, layoutMode],
  );

  // Keep latest layoutResult in a ref for the physics RAF loop
  const layoutResultRef = useRef<MindmapLayoutResult | null>(null);
  layoutResultRef.current = layoutResult;

  // --- Labels removed (text now rendered inside card shapes) ---

  // --- Status + search filtering ---
  const STATUS_KEYS = ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;

  const filteredNodeIds = useMemo(() => {
    const allNodes = layoutResult.nodes;

    // Step 1: status filter (depth-0 always passes)
    const statusPassed = new Set(
      allNodes
        .filter(n => n.depth === 0 || effectiveStatusFilter.has(n.behaviorKey ?? 'BACKLOG'))
        .map(n => n.id),
    );

    // Step 2: search filter
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statusPassed;

    // Find nodes matching search
    const matchSet = new Set(
      allNodes
        .filter(n =>
          n.title.toLowerCase().includes(q) || (n.description ?? '').toLowerCase().includes(q),
        )
        .map(n => n.id),
    );

    // Build parent map for ancestor traversal
    const parentMap = new Map(allNodes.map(n => [n.id, n.parentId]));

    // Collect all ancestors of matching nodes
    const ancestorSet = new Set<string>();
    for (const id of matchSet) {
      let cur: string | null | undefined = parentMap.get(id);
      while (cur) {
        ancestorSet.add(cur);
        cur = parentMap.get(cur);
      }
    }

    const searchPassed = new Set([...matchSet, ...ancestorSet]);

    // Intersection with status filter
    return new Set([...searchPassed].filter(id => statusPassed.has(id)));
  }, [layoutResult.nodes, effectiveStatusFilter, searchQuery]);

  // Direct text matches only (no ancestors — used for highlight)
  const matchedNodeIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      layoutResult.nodes
        .filter(n =>
          n.title.toLowerCase().includes(q) || (n.description ?? '').toLowerCase().includes(q),
        )
        .map(n => n.id),
    );
  }, [layoutResult.nodes, searchQuery]);

  const filteredEdges = useMemo(
    () => layoutResult.edges.filter(
      e => filteredNodeIds.has(e.sourceId) && filteredNodeIds.has(e.targetId),
    ),
    [layoutResult.edges, filteredNodeIds],
  );

  // --- Viewport culling ---
  const visibleNodes = useMemo(
    () => layoutResult.nodes.filter(
      n => filteredNodeIds.has(n.id) && isNodeInViewport(n, stagePos, stageScale, containerWidth, containerHeight),
    ),
    [layoutResult.nodes, filteredNodeIds, stagePos, stageScale, containerWidth, containerHeight],
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

  // --- Context menu state ---
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((nodeId: string, evt: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => {
    const nativeEvt = evt.evt;
    // clientX/clientY = viewport-relative, matches CSS `position: fixed`
    setContextMenu({ nodeId, x: nativeEvt.clientX, y: nativeEvt.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [contextMenu, closeContextMenu]);

  // Clamp menu position so it stays within viewport
  const clampedContextMenuPos = useMemo(() => {
    if (!contextMenu) return null;
    const MENU_W = 220;
    const MENU_H = 230;
    const x = Math.min(contextMenu.x, window.innerWidth - MENU_W - 8);
    const y = Math.min(contextMenu.y, window.innerHeight - MENU_H - 8);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }, [contextMenu]);

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

  // Load a subtree into loadedSubtrees without changing collapse state.
  // Returns the loaded nodes (or empty array).
  const loadSubtree = useCallback(async (nodeId: string): Promise<MindmapNode[]> => {
    if (!accessToken) return [];

    const existing = expandControllersRef.current.get(nodeId);
    if (existing) existing.abort();

    const controller = new AbortController();
    expandControllersRef.current.set(nodeId, controller);

    try {
      setLoadingNodeIds(prev => new Set(prev).add(nodeId));

      const boardId = await ensureChildBoard(nodeId, accessToken);
      if (controller.signal.aborted) return [];

      const boardDetail = await fetchBoardDetail(boardId, accessToken);
      if (controller.signal.aborted || !boardDetail) return [];

      const childBoardsData: Record<string, NodeChildBoard> = {};
      const childBoardsList = await fetchChildBoards(boardDetail.nodeId, accessToken);
      if (controller.signal.aborted) return [];
      for (const cb of childBoardsList) {
        childBoardsData[cb.nodeId] = cb;
      }

      const subtreeNodes = transformSubBoardToNodes(nodeId, boardDetail, childBoardsData);
      setLoadedSubtrees(prev => new Map(prev).set(nodeId, subtreeNodes));
      return subtreeNodes;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return [];
      return [];
    } finally {
      expandControllersRef.current.delete(nodeId);
      setLoadingNodeIds(prev => {
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
    }
  }, [accessToken]);

  const expandNode = useCallback(async (nodeId: string) => {
    await loadSubtree(nodeId);
    setCollapsedIds(prev => {
      const next = materialize(prev);
      next.delete(nodeId);
      return next;
    });
  }, [loadSubtree, materialize]);

  // Pre-check: load subtrees for depth-1 nodes that have childBoards, to determine
  // if they truly have children (hides badge for empty sub-boards).
  // Uses a Set ref so each node is loaded only once; resets on board change.
  const preloadedIdsRef = useRef(new Set<string>());
  useEffect(() => {
    preloadedIdsRef.current = new Set<string>();
  }, [board.id]);

  useEffect(() => {
    if (!accessToken) return;
    const toLoad = Object.keys(childBoards).filter(id => !preloadedIdsRef.current.has(id));
    if (toLoad.length === 0) return;

    for (const id of toLoad) preloadedIdsRef.current.add(id);

    // Load subtrees in parallel (max 4 concurrent)
    const queue = [...toLoad];
    const MAX_CONCURRENT = 4;
    let running = 0;

    const next = () => {
      while (running < MAX_CONCURRENT && queue.length > 0) {
        const id = queue.shift()!;
        running++;
        loadSubtree(id).finally(() => {
          running--;
          next();
        });
      }
    };
    next();
  }, [childBoards, accessToken, loadSubtree]);

  const requestExpand = useCallback((nodeId: string) => {
    const node = mindmapNodes.find(n => n.id === nodeId);
    // A node needs expansion if collapsed OR its children haven't been loaded yet
    const needsExpand = node ? (node.collapsed || !node.childrenLoaded) : true;

    if (needsExpand) {
      if (loadedSubtrees.has(nodeId)) {
        // Already loaded, just uncollapse
        setCollapsedIds(prev => {
          const next = materialize(prev);
          next.delete(nodeId);
          return next;
        });
      } else {
        // Load subtree (expandNode will also uncollapse)
        expandNode(nodeId);
      }
    } else {
      // Collapse
      const controller = expandControllersRef.current.get(nodeId);
      if (controller) {
        controller.abort();
        expandControllersRef.current.delete(nodeId);
      }
      setCollapsedIds(prev => materialize(prev).add(nodeId));
    }
  }, [mindmapNodes, loadedSubtrees, expandNode, materialize]);

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

  const centerOnRoot = useCallback(() => {
    setStageScale(1);
    setStagePos({
      x: containerWidth / 2,
      y: containerHeight / 2,
    });
  }, [containerWidth, containerHeight]);

  const centerOnNode = useCallback((nodeId: string) => {
    const node = layoutResult.nodes.find(n => n.id === nodeId);
    if (!node) return;
    setStagePos({
      x: containerWidth / 2 - node.x * stageScale,
      y: containerHeight / 2 - node.y * stageScale,
    });
  }, [layoutResult.nodes, stageScale, containerWidth, containerHeight]);

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

  // --- Level-by-level expand / collapse ---

  const expandOneLevel = useCallback(() => {
    // Nodes that are effectively collapsed: explicitly collapsed OR not yet loaded
    const effectivelyCollapsed = mindmapNodes.filter(n =>
      n.hasChildren && (n.collapsed || !n.childrenLoaded),
    );
    if (effectivelyCollapsed.length === 0) return;
    const minDepth = Math.min(...effectivelyCollapsed.map(n => n.depth));
    const nodesAtDepth = effectivelyCollapsed.filter(n => n.depth === minDepth);

    // Split: already loaded (just uncollapse) vs needs loading (fetch)
    const toUncollapse = nodesAtDepth.filter(n => n.childrenLoaded);
    const toLoad = nodesAtDepth.filter(n => !n.childrenLoaded);

    if (toUncollapse.length > 0) {
      setCollapsedIds(prev => {
        const next = materialize(prev);
        for (const n of toUncollapse) next.delete(n.id);
        return next;
      });
    }

    // Trigger async loading for unloaded subtrees
    for (const n of toLoad) {
      expandNode(n.id);
    }
  }, [mindmapNodes, materialize, expandNode]);

  const collapseOneLevel = useCallback(() => {
    // Only consider nodes that are truly expanded AND have loaded children
    const expandedLoaded = mindmapNodes.filter(n =>
      n.hasChildren && !n.collapsed && n.childrenLoaded && n.depth > 0,
    );
    if (expandedLoaded.length === 0) return;
    const maxDepth = Math.max(...expandedLoaded.map(n => n.depth));
    setCollapsedIds(prev => {
      const next = materialize(prev);
      for (const n of expandedLoaded) {
        if (n.depth === maxDepth) next.add(n.id);
      }
      return next;
    });
  }, [mindmapNodes, materialize]);

  // --- Bling physics: sync map with current nodes ---
  useEffect(() => {
    const physics = physicsRef.current;
    for (const n of mindmapNodes) {
      if (!physics.has(n.id)) physics.set(n.id, createPhysicsNode());
    }
    for (const key of physics.keys()) {
      if (!mindmapNodes.find(n => n.id === key)) physics.delete(key);
    }
  }, [mindmapNodes]);

  // RAF loop: runs while blingActiveRef is true
  const runBlingLoop = useCallback(() => {
    const tick = () => {
      if (!blingActiveRef.current) return;

      const physics = physicsRef.current;
      const nodes = mindmapNodesRef.current;
      const layout = layoutResultRef.current;
      if (!layout) return;

      tickAllPhysics(physics);

      // Update node positions imperatively
      for (const node of nodes) {
        const s = physics.get(node.id);
        if (!s || s.pinned) continue; // pinned = being dragged by Konva itself
        const ref = nodeRefsMap.current.get(node.id);
        if (ref) { ref.x(node.x + s.ox); ref.y(node.y + s.oy); }
      }

      // Update edge paths imperatively
      for (const edge of layout.edges) {
        const key = `${edge.sourceId}-${edge.targetId}`;
        const konvaEdge = edgeRefsMap.current.get(key);
        if (!konvaEdge) continue;
        const srcNode = layout.nodes.find(n => n.id === edge.sourceId);
        const tgtNode = layout.nodes.find(n => n.id === edge.targetId);
        if (!srcNode || !tgtNode) continue;
        const sP = physics.get(edge.sourceId);
        const tP = physics.get(edge.targetId);
        konvaEdge.data(computeBezierPath(
          { x: srcNode.x + (sP?.ox ?? 0), y: srcNode.y + (sP?.oy ?? 0) },
          { x: tgtNode.x + (tP?.ox ?? 0), y: tgtNode.y + (tP?.oy ?? 0) },
        ));
      }

      stageRef.current?.batchDraw();
      blingRafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(blingRafRef.current);
    blingRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Start / stop bling loop when isBling changes
  useEffect(() => {
    blingActiveRef.current = isBling;
    if (isBling) {
      runBlingLoop();
    } else {
      cancelAnimationFrame(blingRafRef.current);
      // Reset all physics + restore Konva positions
      const physics = physicsRef.current;
      for (const s of physics.values()) {
        s.ox = 0; s.oy = 0; s.vx = 0; s.vy = 0; s.pinned = false;
      }
      for (const node of mindmapNodesRef.current) {
        const ref = nodeRefsMap.current.get(node.id);
        if (ref) { ref.x(node.x); ref.y(node.y); }
      }
      for (const edge of layoutResultRef.current?.edges ?? []) {
        const key = `${edge.sourceId}-${edge.targetId}`;
        const konvaEdge = edgeRefsMap.current.get(key);
        const srcNode = layoutResultRef.current?.nodes.find(n => n.id === edge.sourceId);
        const tgtNode = layoutResultRef.current?.nodes.find(n => n.id === edge.targetId);
        if (konvaEdge && srcNode && tgtNode) {
          konvaEdge.data(computeBezierPath(srcNode, tgtNode));
        }
      }
      stageRef.current?.batchDraw();
    }
  }, [isBling, runBlingLoop]);

  // Bling drag callbacks
  const onBlingDragStart = useCallback((nodeId: string) => {
    const s = physicsRef.current.get(nodeId);
    if (s) { s.pinned = true; }
  }, []);

  const onBlingDragMove = useCallback((nodeId: string, ox: number, oy: number) => {
    const s = physicsRef.current.get(nodeId);
    if (!s) return;
    s.ox = ox;
    s.oy = oy;
    propagateDragToAncestors(nodeId, ox, oy, parentMapRef.current, physicsRef.current);
  }, []);

  const onBlingDragEnd = useCallback((nodeId: string) => {
    const s = physicsRef.current.get(nodeId);
    if (!s) return;
    // Give a slight outward flick for organic feel, then spring brings it back
    s.vx = s.ox * 0.06;
    s.vy = s.oy * 0.06;
    s.pinned = false;
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
  const hasInitializedViewportRef = useRef(false);
  useEffect(() => {
    hasInitializedViewportRef.current = false;
  }, [board.id]);

  useEffect(() => {
    if (!hasInitializedViewportRef.current && containerWidth > 0 && containerHeight > 0 && layoutResult.nodes.length > 0) {
      centerOnRoot();
      hasInitializedViewportRef.current = true;
    }
  }, [containerWidth, containerHeight, layoutResult.nodes.length, centerOnRoot]);

  const handleQuickCreate = useCallback(async () => {
    if (!onCreateTask) return;
    const title = window.prompt(t('mindmap.prompts.newTask'));
    if (!title || !title.trim()) return;
    try {
      await onCreateTask(title.trim());
      fitToContent();
    } catch {
      // task creation errors are handled by the caller
    }
  }, [onCreateTask, fitToContent, t]);

  const handleCreateChildTask = useCallback(async (parentId: string) => {
    if (!onCreateChildTask) return;
    const title = window.prompt(t('mindmap.prompts.newChildTask'));
    if (!title || !title.trim()) return;
    try {
      await onCreateChildTask(parentId, title.trim());
    } catch {
      // task creation errors are handled by the caller
    }
  }, [onCreateChildTask, t]);

  // --- Panel data: show hovered card, fallback to selected card ---
  const hoveredNode = hoveredNodeId ? layoutResult.nodes.find(n => n.id === hoveredNodeId) : null;
  const selectedNode = selectedNodeId ? layoutResult.nodes.find(n => n.id === selectedNodeId) : null;
  const panelNode = hoveredNode ?? selectedNode;

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
              edges={filteredEdges}
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
              matchedNodeIds={matchedNodeIds}
              onSelect={setSelectedNodeId}
              onExpand={requestExpand}
              onOpenTask={onOpenTask}
              onContextMenu={handleContextMenu}
              onHoverStart={onNodeHoverStart}
              onHoverEnd={onNodeHoverEnd}
              registerRef={registerNodeRef}
              isBling={isBling}
              onBlingDragStart={onBlingDragStart}
              onBlingDragMove={onBlingDragMove}
              onBlingDragEnd={onBlingDragEnd}
            />
          </Layer>
        </Stage>
      )}

      {/* Context menu — rendered via portal so `position: fixed` is always viewport-relative */}
      {contextMenu && clampedContextMenuPos && (() => {
        const cmNode = layoutResult.nodes.find(n => n.id === contextMenu.nodeId);
        if (!cmNode) return null;
        return createPortal(
          <>
            {/* Backdrop: catches clicks outside menu to close it */}
            <div
              className="fixed inset-0 z-[9999]"
              onClick={closeContextMenu}
              onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }}
            />
            <div
              ref={contextMenuRef}
              role="menu"
              className="fixed z-[10000] min-w-[180px] rounded-xl border border-white/10 bg-surface/95 p-2 text-sm shadow-xl backdrop-blur"
              style={{ top: clampedContextMenuPos.y, left: clampedContextMenuPos.x }}
            >
            <button
              type="button"
              role="menuitem"
              onClick={() => { closeContextMenu(); centerOnNode(contextMenu.nodeId); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10"
            >
              <Home size={14} /> <span>{t('mindmap.contextMenu.centerOnNode')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { closeContextMenu(); onOpenTask(contextMenu.nodeId); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[12px]">✏️</span> <span>{t('mindmap.contextMenu.edit')}</span>
            </button>
            {onCreateChildTask && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { closeContextMenu(); void handleCreateChildTask(contextMenu.nodeId); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10"
              >
                <Plus size={14} /> <span>{t('mindmap.contextMenu.createChild')}</span>
              </button>
            )}
            {cmNode.hasChildren && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { closeContextMenu(); requestExpand(contextMenu.nodeId); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10"
              >
                <ChevronsUpDown size={14} /> <span>{cmNode.collapsed ? t('mindmap.contextMenu.expand') : t('mindmap.contextMenu.collapse')}</span>
              </button>
            )}
            {childBoards[contextMenu.nodeId] && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { closeContextMenu(); handleNavigateChild(contextMenu.nodeId); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-foreground transition hover:bg-white/10"
              >
                <ArrowUpLeft size={14} className="rotate-180" /> <span>{t('mindmap.contextMenu.openChildBoard')}</span>
              </button>
            )}
            </div>
          </>,
          document.body,
        );
      })()}

      {/* Kanban-style card preview (bottom-left) */}
      {panelNode && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 w-80 max-w-[calc(100%-2rem)] rounded-xl border border-white/10 bg-card/80 text-foreground shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex items-start justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              {panelNode.shortId && (
                <span className="text-xs font-semibold text-muted">#{panelNode.shortId}</span>
              )}
              {panelNode.priority !== 'NONE' && (
                <span className={[
                  'inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full leading-none',
                  panelNode.priority === 'CRITICAL' ? 'bg-red-900 text-red-300' :
                  panelNode.priority === 'HIGH' ? 'bg-orange-900 text-orange-300' :
                  panelNode.priority === 'MEDIUM' ? 'bg-yellow-900 text-yellow-300' :
                  'bg-green-900 text-green-300',
                ].join(' ')}>
                  {t(`mindmap.priority.${panelNode.priority.toLowerCase()}`)}
                </span>
              )}
            </div>
            {panelNode.behaviorKey && (
              <span className={[
                'inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full leading-none',
                panelNode.behaviorKey === 'DONE' ? 'bg-emerald-900 text-emerald-300' :
                panelNode.behaviorKey === 'IN_PROGRESS' ? 'bg-sky-900 text-sky-300' :
                panelNode.behaviorKey === 'BLOCKED' ? 'bg-rose-900 text-rose-300' :
                'bg-amber-900 text-amber-300',
              ].join(' ')}>
                {panelNode.behaviorKey.replace('_', ' ')}
              </span>
            )}
          </div>
          {/* Body */}
          <div className="px-4 pb-2">
            <h3 className="font-bold text-sm text-foreground mb-1 break-words">{panelNode.title}</h3>
            {panelNode.description && (
              <p className="text-xs leading-snug text-muted line-clamp-2">{panelNode.description}</p>
            )}
          </div>
          <div className="mx-4 h-px bg-white/10" />
          {/* Footer */}
          <div className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {panelNode.assignees.length > 0 && (
                <div className="flex -space-x-2">
                  {panelNode.assignees.slice(0, 3).map(a => (
                    <div
                      key={a.id}
                      className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-[color:var(--color-background)] bg-blue-900"
                      title={a.displayName}
                    >
                      <span className="text-[10px] font-bold text-blue-200">
                        {a.displayName.split(/\s+/).map(p => p.charAt(0)).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                  ))}
                  {panelNode.assignees.length > 3 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-[color:var(--color-background)] bg-surface/70">
                      <span className="text-[9px] font-semibold text-muted">+{panelNode.assignees.length - 3}</span>
                    </div>
                  )}
                </div>
              )}
              {panelNode.dueAt && (() => {
                const dueDate = new Date(panelNode.dueAt);
                if (Number.isNaN(dueDate.getTime())) return null;
                const today = new Date();
                const diff = Math.round((new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
                const cls = diff <= 0 ? 'bg-red-500/20 border-red-500/30 text-red-300' :
                  diff <= 3 ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' :
                  'bg-teal-500/20 border-teal-500/30 text-teal-300';
                return (
                  <span className={`inline-flex min-w-[2.5rem] justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
                    {diff > 0 ? `-${diff}` : diff < 0 ? `+${Math.abs(diff)}` : '0'}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-3">
              {panelNode.progress > 0 && (
                <div className="flex h-5 min-w-[38px] items-center justify-center rounded-md border border-white/10 bg-surface/70 text-[10px] font-semibold text-foreground">
                  {Math.round(panelNode.progress)}%
                </div>
              )}
              {panelNode.effort && (
                <span className="text-[10px] font-medium text-muted">{panelNode.effort}</span>
              )}
              {panelNode.counts && (
                <div className="flex items-center gap-[1px] text-[10px] font-mono">
                  <span className="text-amber-400">{panelNode.counts.backlog}</span>
                  <span className="text-muted">.</span>
                  <span className="text-sky-400">{panelNode.counts.inProgress}</span>
                  <span className="text-muted">.</span>
                  <span className="text-red-400">{panelNode.counts.blocked}</span>
                  <span className="text-muted">.</span>
                  <span className="text-emerald-400">{panelNode.counts.done}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter panel — supprimé : la recherche est dans BoardFilterBar, les statuts dans le rightSlot */}

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
          onClick={centerOnRoot}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.centerRoot')}
        >
          <Home size={16} />
        </button>
        {hasParentBoard && onOpenParentBoard && (
          <button
            type="button"
            onClick={onOpenParentBoard}
            className="rounded-full p-1.5 text-muted transition hover:text-foreground"
            title={t('mindmap.toolbar.goToParent')}
          >
            <ArrowUpLeft size={16} />
          </button>
        )}
        {onCreateTask && (
          <button
            type="button"
            onClick={() => {
              void handleQuickCreate();
            }}
            className="rounded-full p-1.5 text-muted transition hover:text-foreground"
            title={t('mindmap.toolbar.quickAdd')}
          >
            <Plus size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={expandOneLevel}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.expandAll')}
        >
          <ChevronsUpDown size={16} />
        </button>
        <button
          type="button"
          onClick={collapseOneLevel}
          className="rounded-full p-1.5 text-muted transition hover:text-foreground"
          title={t('mindmap.toolbar.collapseAll')}
        >
          <ChevronsUpDown size={16} className="rotate-90" />
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setLayoutMode('radial')}
          className={[
            'rounded-full p-1.5 transition',
            layoutMode === 'radial' ? 'text-accent' : 'text-muted hover:text-foreground',
          ].join(' ')}
          title={t('mindmap.toolbar.layoutRadial')}
        >
          <Network size={16} />
        </button>
        <button
          type="button"
          onClick={() => setLayoutMode('horizontal')}
          className={[
            'rounded-full p-1.5 transition',
            layoutMode === 'horizontal' ? 'text-accent' : 'text-muted hover:text-foreground',
          ].join(' ')}
          title={t('mindmap.toolbar.layoutHorizontal')}
        >
          <GitFork size={16} />
        </button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setIsBling(v => !v)}
          className={[
            'rounded-full p-1.5 transition',
            isBling
              ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.8)]'
              : 'text-muted hover:text-amber-400',
          ].join(' ')}
          title={isBling ? t('mindmap.toolbar.blingOff') : t('mindmap.toolbar.blingOn')}
        >
          <Sparkles size={16} />
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
