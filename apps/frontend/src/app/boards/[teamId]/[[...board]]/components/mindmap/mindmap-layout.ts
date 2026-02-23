import type { MindmapNode, MindmapLayoutResult, MindmapEdge, MindmapLayoutMode } from './mindmap-types';
import { LAYOUT_CONSTANTS } from './mindmap-types';
import { buildEdges } from './mindmap-transform';

// ---------------------------------------------------------------------------
// Deterministic radial layout algorithm
// ---------------------------------------------------------------------------

const {
  BASE_RADIUS,
  LEVEL_SPACING,
  MIN_NODE_DISTANCE,
  NODE_RADIUS,
  LABEL_MAX_WIDTH,
  MAX_VISIBLE_CHILDREN,
  ANCHOR_BLEND,
} = LAYOUT_CONSTANTS;

const EPSILON = 1e-10;

/**
 * Computes a deterministic radial layout for the given flat node list.
 * Pure function — no side-effects, no DOM dependency.
 */
export function computeRadialLayout(nodes: MindmapNode[]): MindmapLayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, centerX: 0, centerY: 0 };
  }

  // 1. Build parent→children map
  const childrenMap = new Map<string, MindmapNode[]>();
  let root: MindmapNode | undefined;

  for (const node of nodes) {
    if (node.parentId === null) {
      root = node;
    } else {
      const siblings = childrenMap.get(node.parentId);
      if (siblings) {
        siblings.push(node);
      } else {
        childrenMap.set(node.parentId, [node]);
      }
    }
  }

  if (!root) {
    return { nodes, edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, centerX: 0, centerY: 0 };
  }

  // 2. Weight function with memoization (O(n) total)
  const weightCache = new Map<string, number>();

  function weight(nodeId: string): number {
    const cached = weightCache.get(nodeId);
    if (cached !== undefined) return cached;
    const children = childrenMap.get(nodeId);
    if (!children || children.length === 0) {
      weightCache.set(nodeId, 1);
      return 1;
    }
    let sum = 0;
    for (const c of children) {
      sum += weight(c.id);
    }
    weightCache.set(nodeId, sum);
    return sum;
  }

  // 3. Place root at center
  root.x = 0;
  root.y = 0;
  root.radius = 0;
  root.angle = 0;

  // 4. Anchored sweep calculation (depth-1 only)
  function computeAnchoredSweeps(children: MindmapNode[], totalSweep: number): number[] {
    const n = children.length;
    const uniformSweep = totalSweep / n;
    const weights = children.map(c => weight(c.id));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    if (totalWeight === 0) {
      return children.map(() => uniformSweep);
    }

    const sweeps: number[] = [];
    for (let i = 0; i < n; i++) {
      const weightSweep = totalSweep * (weights[i] / totalWeight);
      const anchoredSweep = weightSweep + (uniformSweep - weightSweep) * ANCHOR_BLEND;
      sweeps.push(anchoredSweep);
    }

    // Normalize so sum = totalSweep
    const sweepSum = sweeps.reduce((a, b) => a + b, 0);
    if (sweepSum > 0) {
      const ratio = totalSweep / sweepSum;
      for (let i = 0; i < sweeps.length; i++) {
        sweeps[i] *= ratio;
      }
    }

    return sweeps;
  }

  // 5. Recursive placement
  // parentRadius: the actual radius at which the parent was placed (0 for root).
  // This lets each ring keep a guaranteed gap from its parent regardless of how
  // far out the parent was pushed by its own sibling count.
  function placeChildren(
    parentId: string,
    startAngle: number,
    sweepAngle: number,
    depth: number,
    parentRadius: number,
  ): void {
    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) return;

    // Three candidates — take the largest so every constraint is satisfied:
    //   (a) progressive baseline:  BASE_RADIUS + depth rings of LEVEL_SPACING
    //   (b) arc-fit:               all children spaced by MIN_NODE_DISTANCE
    //   (c) parent gap:            parent's actual radius + one LEVEL_SPACING gap
    const baseline   = BASE_RADIUS + (depth - 1) * LEVEL_SPACING;
    const arcFit     = (children.length * MIN_NODE_DISTANCE) / sweepAngle;
    const parentGap  = parentRadius + LEVEL_SPACING;
    const radius     = Math.max(baseline, arcFit, parentGap);

    // Minimum arc per node at the chosen radius
    const minAnglePerNode = MIN_NODE_DISTANCE / radius;

    // Compute sweeps — anchored at depth 1, proportional otherwise
    const totalWeight = children.reduce((sum, c) => sum + weight(c.id), 0);
    let childSweeps: number[];

    if (depth === 1) {
      childSweeps = computeAnchoredSweeps(children, sweepAngle);
    } else {
      childSweeps = children.map(c => {
        const w = weight(c.id);
        let sweep = totalWeight > 0 ? sweepAngle * (w / totalWeight) : sweepAngle / children.length;
        sweep = Math.max(sweep, minAnglePerNode);
        return sweep;
      });
    }

    let currentAngle = startAngle;

    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      const childSweep = childSweeps[index];

      child.angle = currentAngle + childSweep / 2 + index * EPSILON;
      child.radius = radius;
      child.x = radius * Math.cos(child.angle);
      child.y = radius * Math.sin(child.angle);
      child.depth = depth;

      // Recurse — pass this ring's actual radius as the parent radius
      if (!child.collapsed && childrenMap.has(child.id)) {
        placeChildren(child.id, currentAngle, childSweep, depth + 1, radius);
      }

      currentAngle += childSweep;
    }
  }

  // 6. Launch layout from root (parentRadius = 0 for root)
  placeChildren(root.id, -Math.PI, 2 * Math.PI, 1, 0);

  // 7. Compute bounds (using rectangle half-widths)
  const halfW = LAYOUT_CONSTANTS.NODE_WIDTH / 2 + 20;
  const halfH = LAYOUT_CONSTANTS.NODE_HEIGHT / 2 + 20;
  let minX = -halfW;
  let maxX = halfW;
  let minY = -halfH;
  let maxY = halfH;

  for (const node of nodes) {
    if (node.x - halfW < minX) minX = node.x - halfW;
    if (node.x + halfW > maxX) maxX = node.x + halfW;
    if (node.y - halfH < minY) minY = node.y - halfH;
    if (node.y + halfH > maxY) maxY = node.y + halfH;
  }

  const edges = buildEdges(nodes);

  return { nodes, edges, bounds: { minX, maxX, minY, maxY }, centerX: 0, centerY: 0 };
}

// ---------------------------------------------------------------------------
// Collision detection (sliding window)
// ---------------------------------------------------------------------------

export function detectCollisions(nodes: MindmapNode[]): Array<[string, string]> {
  const collisions: Array<[string, string]> = [];
  const minDist = LAYOUT_CONSTANTS.NODE_WIDTH + 10;

  const byDepth = new Map<number, MindmapNode[]>();
  for (const node of nodes) {
    const arr = byDepth.get(node.depth) ?? [];
    arr.push(node);
    byDepth.set(node.depth, arr);
  }

  for (const [depth, depthNodes] of byDepth) {
    depthNodes.sort((a, b) => a.angle - b.angle);

    const ringRadius = depth === 0 ? 0 : BASE_RADIUS + (depth - 1) * LEVEL_SPACING;
    const angleThreshold = ringRadius > 0 ? minDist / ringRadius : Infinity;

    for (let i = 0; i < depthNodes.length; i++) {
      const a = depthNodes[i];
      for (let j = i + 1; j < depthNodes.length; j++) {
        const b = depthNodes[j];
        const angleDelta = b.angle - a.angle;
        if (angleDelta > angleThreshold) break;

        const dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        if (dist < minDist) {
          collisions.push([a.id, b.id]);
        }
      }
    }
  }
  return collisions;
}

// ---------------------------------------------------------------------------
// Viewport culling
// ---------------------------------------------------------------------------

export function isNodeInViewport(
  node: MindmapNode,
  stagePos: { x: number; y: number },
  stageScale: number,
  containerWidth: number,
  containerHeight: number,
): boolean {
  const screenX = node.x * stageScale + stagePos.x;
  const screenY = node.y * stageScale + stagePos.y;
  const CULL_MARGIN = LAYOUT_CONSTANTS.NODE_WIDTH;
  return (
    screenX >= -CULL_MARGIN &&
    screenX <= containerWidth + CULL_MARGIN &&
    screenY >= -CULL_MARGIN &&
    screenY <= containerHeight + CULL_MARGIN
  );
}

// ---------------------------------------------------------------------------
// Horizontal (left-right tidy tree) layout
// ---------------------------------------------------------------------------

// Horizontal layout constants
const H_LEVEL_SPACING = 200; // px between depth levels (horizontal)
const H_NODE_SLOT = 60;      // px of vertical slot per leaf (NODE_HEIGHT=40 + 20px gap)

/**
 * Computes a deterministic horizontal (left-right) mindmap layout.
 *
 * - Root stays at (0, 0).
 * - depth-1 children are split into two halves: the first ceil(N/2) go to the
 *   right side (positive x), the rest go to the left side (negative x).
 * - Within each side, a tidy-tree algorithm stacks subtrees vertically and
 *   centres each parent between its first and last child.
 * - All positions are fully deterministic given the same input order.
 */
export function computeHorizontalLayout(nodes: MindmapNode[]): MindmapLayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, centerX: 0, centerY: 0 };
  }

  // 1. Build parent→children map (only visible nodes are present)
  const childrenMap = new Map<string, MindmapNode[]>();
  let root: MindmapNode | undefined;

  for (const node of nodes) {
    if (node.parentId === null) {
      root = node;
    } else {
      const arr = childrenMap.get(node.parentId);
      if (arr) { arr.push(node); } else { childrenMap.set(node.parentId, [node]); }
    }
  }

  if (!root) {
    return { nodes, edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }, centerX: 0, centerY: 0 };
  }

  // 2. Place root at center
  root.x = 0; root.y = 0; root.radius = 0; root.angle = 0;

  // 3. Memoised leaf count — drives vertical slot sizing
  const leafCache = new Map<string, number>();
  function leaves(nodeId: string): number {
    const cached = leafCache.get(nodeId);
    if (cached !== undefined) return cached;
    const children = childrenMap.get(nodeId);
    if (!children || children.length === 0) { leafCache.set(nodeId, 1); return 1; }
    const total = children.reduce((s, c) => s + leaves(c.id), 0);
    leafCache.set(nodeId, total);
    return total;
  }

  const depth1 = childrenMap.get(root.id) ?? [];

  // 4. Split into right/left halves (stable order, first half → right)
  const mid = Math.ceil(depth1.length / 2);
  const rightNodes = depth1.slice(0, mid);
  const leftNodes  = depth1.slice(mid);

  // 5. Layout a side with a simple top-down tidy tree
  //    sign=1 → right (positive x), sign=-1 → left (negative x)
  function layoutSide(sideRoots: MindmapNode[], sign: 1 | -1): void {
    if (sideRoots.length === 0) return;

    // Total height of this side → centre at y=0
    const totalLeaves = sideRoots.reduce((s, n) => s + leaves(n.id), 0);
    let currentY = -(totalLeaves * H_NODE_SLOT) / 2;

    // Recursively places node and its visible subtree.
    // yTop = top of the vertical slot allocated for this subtree.
    // Returns the bottom edge of the consumed slot.
    function placeSubtree(node: MindmapNode, yTop: number): number {
      const children = childrenMap.get(node.id);
      const isLeaf = !children || children.length === 0;

      // x: depth is already set correctly by transformBoardToMindmapTree
      node.x      = sign * node.depth * H_LEVEL_SPACING;
      node.angle  = sign > 0 ? 0 : Math.PI;
      node.radius = node.depth * H_LEVEL_SPACING;

      if (isLeaf) {
        node.y = yTop + H_NODE_SLOT / 2;
        return yTop + H_NODE_SLOT;
      }

      // Place children first so we can centre the parent between them
      let childTop = yTop;
      for (const child of children) {
        childTop = placeSubtree(child, childTop);
      }

      // Centre parent between first and last child midpoints
      node.y = (children[0].y + children[children.length - 1].y) / 2;

      return childTop;
    }

    for (const sideRoot of sideRoots) {
      const slotHeight = leaves(sideRoot.id) * H_NODE_SLOT;
      placeSubtree(sideRoot, currentY);
      currentY += slotHeight;
    }
  }

  layoutSide(rightNodes,  1);
  layoutSide(leftNodes,  -1);

  // 6. Compute bounds
  const halfW = LAYOUT_CONSTANTS.NODE_WIDTH  / 2 + 20;
  const halfH = LAYOUT_CONSTANTS.NODE_HEIGHT / 2 + 20;
  let minX = -halfW, maxX = halfW, minY = -halfH, maxY = halfH;
  for (const node of nodes) {
    if (node.x - halfW < minX) minX = node.x - halfW;
    if (node.x + halfW > maxX) maxX = node.x + halfW;
    if (node.y - halfH < minY) minY = node.y - halfH;
    if (node.y + halfH > maxY) maxY = node.y + halfH;
  }

  const edges = buildEdges(nodes);
  return { nodes, edges, bounds: { minX, maxX, minY, maxY }, centerX: 0, centerY: 0 };
}

// ---------------------------------------------------------------------------
// Unified entry point
// ---------------------------------------------------------------------------

/**
 * Computes a mindmap layout for the given mode.
 * Both layouts are pure functions with deterministic output.
 */
export function computeMindmapLayout(
  nodes: MindmapNode[],
  mode: MindmapLayoutMode,
): MindmapLayoutResult {
  return mode === 'horizontal'
    ? computeHorizontalLayout(nodes)
    : computeRadialLayout(nodes);
}
