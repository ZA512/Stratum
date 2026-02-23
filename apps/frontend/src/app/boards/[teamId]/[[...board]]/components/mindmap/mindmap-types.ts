import type { ColumnBehaviorKey } from '@/features/boards/boards-api';

// ---------------------------------------------------------------------------
// Core data types for the Mindmap view
// ---------------------------------------------------------------------------

/** Flattened node for the radial mindmap layout */
export interface MindmapNode {
  id: string;
  parentId: string | null;
  title: string;
  depth: number; // 0 = displayed root
  progress: number; // 0-100
  priority: 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';
  effort: string | null;
  behaviorKey: ColumnBehaviorKey | null;
  hasChildren: boolean;
  childrenLoaded: boolean;
  collapsed: boolean;
  assignees: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
  dueAt: string | null;
  description: string | null;
  shortId: number | null;
  counts: { backlog: number; inProgress: number; blocked: number; done: number } | null;
  // Computed by layout
  x: number;
  y: number;
  angle: number; // radians
  radius: number; // distance from center
}

/** Parent → child edge */
export interface MindmapEdge {
  sourceId: string;
  targetId: string;
}

/** Snapshot of a node's visual state for animation interpolation */
export interface NodeSnapshot {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
}

/** Label placement computed after layout */
export interface LabelPlacement {
  nodeId: string;
  x: number;
  y: number;
  anchor: 'left' | 'right';
  maxWidth: number;
  visible: boolean;
}

/** Complete result of the radial layout algorithm */
export interface MindmapLayoutResult {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  centerX: number;
  centerY: number;
}

/** Which layout algorithm to use */
export type MindmapLayoutMode = 'radial' | 'horizontal';

/** Transition between two layouts for animation */
export interface LayoutTransition {
  startTime: number;
  duration: number;
  from: Map<string, NodeSnapshot>;
  to: Map<string, NodeSnapshot>;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const LAYOUT_CONSTANTS = {
  BASE_RADIUS: 240,
  LEVEL_SPACING: 180,
  MIN_NODE_DISTANCE: 170,
  NODE_RADIUS: 24,
  LABEL_MAX_WIDTH: 120,
  ROOT_RADIUS: 32,
  COLLAPSE_INDICATOR_SIZE: 8,
  MAX_VISIBLE_CHILDREN: 20,
  ANCHOR_BLEND: 0.4,
  // Rectangle card dimensions
  NODE_WIDTH: 140,
  NODE_HEIGHT: 40,
  ROOT_WIDTH: 180,
  ROOT_HEIGHT: 48,
} as const;
