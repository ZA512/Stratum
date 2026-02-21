import type { MindmapNode, LabelPlacement } from './mindmap-types';
import { LAYOUT_CONSTANTS } from './mindmap-types';

// ---------------------------------------------------------------------------
// Label placement with anti-collision (O(n) neighbor distance)
// ---------------------------------------------------------------------------

const LABEL_HEIGHT = 16;
const MIN_LABEL_WIDTH = 40;
const MIN_VERTICAL_GAP = 4;

/**
 * Computes label placements for all visible nodes, handling:
 * - Left/right anchor based on angle
 * - Truncation based on neighbor distance
 * - Vertical de-overlapping pass
 */
export function computeLabelPlacements(nodes: MindmapNode[]): LabelPlacement[] {
  // Group by depth and sort by angle to find neighbor distances in O(n)
  const byDepth = new Map<number, MindmapNode[]>();
  for (const node of nodes) {
    if (node.depth === 0) continue;
    const arr = byDepth.get(node.depth) ?? [];
    arr.push(node);
    byDepth.set(node.depth, arr);
  }

  const neighborDist = new Map<string, number>();
  for (const [, depthNodes] of byDepth) {
    depthNodes.sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < depthNodes.length; i++) {
      const prev = depthNodes[i - 1];
      const next = depthNodes[i + 1];
      const node = depthNodes[i];
      let minDist = Infinity;
      if (prev) {
        minDist = Math.min(minDist, Math.sqrt((prev.x - node.x) ** 2 + (prev.y - node.y) ** 2));
      }
      if (next) {
        minDist = Math.min(minDist, Math.sqrt((next.x - node.x) ** 2 + (next.y - node.y) ** 2));
      }
      neighborDist.set(node.id, minDist);
    }
  }

  const placements: LabelPlacement[] = [];

  for (const node of nodes) {
    if (node.depth === 0) continue;

    const isRight = node.angle >= -Math.PI / 2 && node.angle <= Math.PI / 2;
    const anchor: 'left' | 'right' = isRight ? 'left' : 'right';

    const minNeighborDist = neighborDist.get(node.id) ?? Infinity;

    const availableWidth = Math.min(
      LAYOUT_CONSTANTS.LABEL_MAX_WIDTH,
      minNeighborDist < Infinity
        ? (minNeighborDist - LAYOUT_CONSTANTS.NODE_RADIUS * 2 - 12) / 2
        : LAYOUT_CONSTANTS.LABEL_MAX_WIDTH,
    );

    placements.push({
      nodeId: node.id,
      x: node.x + (isRight ? 1 : -1) * (LAYOUT_CONSTANTS.NODE_RADIUS + 6),
      y: node.y,
      anchor,
      maxWidth: Math.max(availableWidth, 0),
      visible: availableWidth >= MIN_LABEL_WIDTH,
    });
  }

  // Vertical de-overlapping pass
  const rightLabels = placements
    .filter(p => p.anchor === 'left' && p.visible)
    .sort((a, b) => a.y - b.y);
  const leftLabels = placements
    .filter(p => p.anchor === 'right' && p.visible)
    .sort((a, b) => a.y - b.y);

  for (const group of [rightLabels, leftLabels]) {
    let consecutiveShifts = 0;
    for (let i = 1; i < group.length; i++) {
      const gap = group[i].y - group[i - 1].y - LABEL_HEIGHT;
      if (gap < MIN_VERTICAL_GAP) {
        consecutiveShifts++;
        if (consecutiveShifts >= 3) {
          group[i].visible = false;
        } else {
          group[i].y += MIN_VERTICAL_GAP - gap;
        }
      } else {
        consecutiveShifts = 0;
      }
    }
  }

  return placements;
}
