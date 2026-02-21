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
  BASE_RADIUS: 180,
  LEVEL_SPACING: 140,
  MIN_NODE_DISTANCE: 60,
  NODE_RADIUS: 24,
  LABEL_MAX_WIDTH: 120,
  ROOT_RADIUS: 32,
  COLLAPSE_INDICATOR_SIZE: 8,
  MAX_VISIBLE_CHILDREN: 20,
  ANCHOR_BLEND: 0.4,
} as const;
