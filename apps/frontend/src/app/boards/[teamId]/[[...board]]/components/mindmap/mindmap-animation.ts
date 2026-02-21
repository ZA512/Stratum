import type Konva from 'konva';
import type { MindmapNode, NodeSnapshot, LayoutTransition } from './mindmap-types';
import { computeBezierPath } from './MindmapEdgesLayer';

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

// ---------------------------------------------------------------------------
// Build transition snapshots
// ---------------------------------------------------------------------------

export function buildTransition(
  oldNodes: MindmapNode[],
  newNodes: MindmapNode[],
  duration: number = 350,
): LayoutTransition {
  const oldMap = new Map(oldNodes.map(n => [n.id, { x: n.x, y: n.y, scaleX: 1, scaleY: 1, opacity: 1 } as NodeSnapshot]));
  const newMap = new Map(newNodes.map(n => [n.id, { x: n.x, y: n.y, scaleX: 1, scaleY: 1, opacity: 1 } as NodeSnapshot]));

  const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);
  const fromSnapshots = new Map<string, NodeSnapshot>();
  const toSnapshots = new Map<string, NodeSnapshot>();

  // Index for parent positions (for entering/exiting nodes)
  const newNodeMap = new Map(newNodes.map(n => [n.id, n]));
  const oldNodeMap = new Map(oldNodes.map(n => [n.id, n]));

  for (const id of allIds) {
    const hasOld = oldMap.has(id);
    const hasNew = newMap.has(id);

    if (hasOld && hasNew) {
      // PERSISTING
      fromSnapshots.set(id, oldMap.get(id)!);
      toSnapshots.set(id, newMap.get(id)!);
    } else if (!hasOld && hasNew) {
      // ENTERING — start from parent position
      const node = newNodeMap.get(id)!;
      const parentPos = node.parentId ? (newMap.get(node.parentId) ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
      fromSnapshots.set(id, { x: parentPos.x, y: parentPos.y, scaleX: 0, scaleY: 0, opacity: 0 });
      toSnapshots.set(id, { ...newMap.get(id)!, scaleX: 1, scaleY: 1, opacity: 1 });
    } else if (hasOld && !hasNew) {
      // EXITING — collapse toward parent
      const node = oldNodeMap.get(id)!;
      const parentPos = node.parentId
        ? (newMap.get(node.parentId) ?? oldMap.get(node.parentId) ?? { x: 0, y: 0 })
        : { x: 0, y: 0 };
      fromSnapshots.set(id, oldMap.get(id)!);
      toSnapshots.set(id, { x: parentPos.x, y: parentPos.y, scaleX: 0, scaleY: 0, opacity: 0 });
    }
  }

  return {
    startTime: performance.now(),
    duration,
    from: fromSnapshots,
    to: toSnapshots,
  };
}

// ---------------------------------------------------------------------------
// rAF ticker — updates Konva shapes directly via refs
// ---------------------------------------------------------------------------

export function tickTransition(
  transition: LayoutTransition,
  nodeRefsMap: Map<string, Konva.Group>,
  edgeRefsMap: Map<string, Konva.Path>,
  edges: Array<{ sourceId: string; targetId: string }>,
  nodesLayer: Konva.Layer | null,
  edgesLayer: Konva.Layer | null,
  onComplete: () => void,
): void {
  const now = performance.now();
  const elapsed = now - transition.startTime;
  const rawT = clamp(elapsed / transition.duration, 0, 1);
  const t = easeInOut(rawT);

  // Update each node shape via ref
  for (const [id, fromSnap] of transition.from) {
    const toSnap = transition.to.get(id);
    if (!toSnap) continue;
    const group = nodeRefsMap.get(id);
    if (!group) continue;

    group.x(lerp(fromSnap.x, toSnap.x, t));
    group.y(lerp(fromSnap.y, toSnap.y, t));
    group.scaleX(lerp(fromSnap.scaleX, toSnap.scaleX, t));
    group.scaleY(lerp(fromSnap.scaleY, toSnap.scaleY, t));
    group.opacity(lerp(fromSnap.opacity, toSnap.opacity, t));
  }

  // Update edges by reading current Group positions
  for (const edge of edges) {
    const sourceGroup = nodeRefsMap.get(edge.sourceId);
    const targetGroup = nodeRefsMap.get(edge.targetId);
    const pathRef = edgeRefsMap.get(`${edge.sourceId}-${edge.targetId}`);
    if (pathRef && sourceGroup && targetGroup) {
      pathRef.data(computeBezierPath(
        { x: sourceGroup.x(), y: sourceGroup.y() },
        { x: targetGroup.x(), y: targetGroup.y() },
      ));
    }
  }

  // Batch draw affected layers
  nodesLayer?.batchDraw();
  edgesLayer?.batchDraw();

  if (rawT < 1) {
    requestAnimationFrame(() =>
      tickTransition(transition, nodeRefsMap, edgeRefsMap, edges, nodesLayer, edgesLayer, onComplete),
    );
  } else {
    onComplete();
  }
}
