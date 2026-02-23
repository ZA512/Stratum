import { describe, it, expect } from 'vitest';
import type { MindmapNode } from './mindmap-types';
import {
  computeRadialLayout,
  computeHorizontalLayout,
  computeMindmapLayout,
} from './mindmap-layout';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, parentId: string | null, depth: number): MindmapNode {
  return {
    id,
    parentId,
    title: id,
    depth,
    progress: 0,
    priority: 'NONE',
    effort: null,
    behaviorKey: null,
    hasChildren: false,
    childrenLoaded: false,
    collapsed: false,
    assignees: [],
    dueAt: null,
    description: null,
    shortId: null,
    counts: null,
    x: 0,
    y: 0,
    angle: 0,
    radius: 0,
  };
}

/** Deep-clone a node array so layout mutations don't bleed between calls */
function cloneNodes(nodes: MindmapNode[]): MindmapNode[] {
  return nodes.map(n => ({ ...n }));
}

/** Build a simple 3-level tree: root → [a, b, c] → [a1, a2] */
function buildTree(): MindmapNode[] {
  return [
    makeNode('root', null,   0),
    makeNode('a',    'root', 1),
    makeNode('b',    'root', 1),
    makeNode('c',    'root', 1),
    makeNode('a1',   'a',    2),
    makeNode('a2',   'a',    2),
  ];
}

// ---------------------------------------------------------------------------
// computeRadialLayout
// ---------------------------------------------------------------------------

describe('computeRadialLayout', () => {
  it('determinism — same input order → identical positions', () => {
    const r1 = computeRadialLayout(cloneNodes(buildTree()));
    const r2 = computeRadialLayout(cloneNodes(buildTree()));

    for (const n of r1.nodes) {
      const m = r2.nodes.find(x => x.id === n.id);
      expect(m).toBeDefined();
      expect(n.x).toBeCloseTo(m!.x, 5);
      expect(n.y).toBeCloseTo(m!.y, 5);
    }
  });

  it('smoke — root stays at origin', () => {
    const result = computeRadialLayout(cloneNodes(buildTree()));
    const root = result.nodes.find(n => n.id === 'root')!;
    expect(root.x).toBe(0);
    expect(root.y).toBe(0);
  });

  it('smoke — returns coherent bounds', () => {
    const result = computeRadialLayout(cloneNodes(buildTree()));
    expect(result.bounds.maxX).toBeGreaterThan(result.bounds.minX);
    expect(result.bounds.maxY).toBeGreaterThan(result.bounds.minY);
  });

  it('smoke — edges reflect parent-child relationships', () => {
    const result = computeRadialLayout(cloneNodes(buildTree()));
    // Each non-root node should have exactly one incoming edge
    const nonRoot = buildTree().filter(n => n.parentId !== null);
    expect(result.edges).toHaveLength(nonRoot.length);
    for (const edge of result.edges) {
      const target = result.nodes.find(n => n.id === edge.targetId);
      expect(target?.parentId).toBe(edge.sourceId);
    }
  });

  it('empty input → empty result', () => {
    const result = computeRadialLayout([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeHorizontalLayout
// ---------------------------------------------------------------------------

describe('computeHorizontalLayout', () => {
  it('determinism — same input order → identical positions', () => {
    const r1 = computeHorizontalLayout(cloneNodes(buildTree()));
    const r2 = computeHorizontalLayout(cloneNodes(buildTree()));

    for (const n of r1.nodes) {
      const m = r2.nodes.find(x => x.id === n.id);
      expect(m).toBeDefined();
      expect(n.x).toBeCloseTo(m!.x, 5);
      expect(n.y).toBeCloseTo(m!.y, 5);
    }
  });

  it('smoke — root stays at origin', () => {
    const result = computeHorizontalLayout(cloneNodes(buildTree()));
    const root = result.nodes.find(n => n.id === 'root')!;
    expect(root.x).toBe(0);
    expect(root.y).toBe(0);
  });

  it('side split — right half has positive x, left half has negative x', () => {
    // 4 depth-1 children → first 2 right (ceil(4/2)=2), last 2 left
    const nodes = [
      makeNode('root', null,   0),
      makeNode('r1',   'root', 1), // right
      makeNode('r2',   'root', 1), // right
      makeNode('l1',   'root', 1), // left
      makeNode('l2',   'root', 1), // left
    ];
    const result = computeHorizontalLayout(cloneNodes(nodes));
    expect(result.nodes.find(n => n.id === 'r1')!.x).toBeGreaterThan(0);
    expect(result.nodes.find(n => n.id === 'r2')!.x).toBeGreaterThan(0);
    expect(result.nodes.find(n => n.id === 'l1')!.x).toBeLessThan(0);
    expect(result.nodes.find(n => n.id === 'l2')!.x).toBeLessThan(0);
  });

  it('side split — single child goes to right side', () => {
    const nodes = [makeNode('root', null, 0), makeNode('only', 'root', 1)];
    const result = computeHorizontalLayout(cloneNodes(nodes));
    expect(result.nodes.find(n => n.id === 'only')!.x).toBeGreaterThan(0);
  });

  it('smoke — deeper nodes are further from center than shallower ones (same side)', () => {
    const result = computeHorizontalLayout(cloneNodes(buildTree()));
    // a1 and a2 (depth=2, right side) should have |x| > a (depth=1, right side)
    const aNode  = result.nodes.find(n => n.id === 'a')!;
    const a1Node = result.nodes.find(n => n.id === 'a1')!;
    expect(Math.abs(a1Node.x)).toBeGreaterThan(Math.abs(aNode.x));
  });

  it('smoke — returns coherent bounds', () => {
    const result = computeHorizontalLayout(cloneNodes(buildTree()));
    expect(result.bounds.maxX).toBeGreaterThan(result.bounds.minX);
    expect(result.bounds.maxY).toBeGreaterThan(result.bounds.minY);
  });

  it('empty input → empty result', () => {
    const result = computeHorizontalLayout([]);
    expect(result.nodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeMindmapLayout (dispatcher)
// ---------------------------------------------------------------------------

describe('computeMindmapLayout', () => {
  it('radial mode → same result as computeRadialLayout', () => {
    const base = cloneNodes(buildTree());
    const r1 = computeMindmapLayout(cloneNodes(base), 'radial');
    const r2 = computeRadialLayout(cloneNodes(base));

    for (const n of r1.nodes) {
      const m = r2.nodes.find(x => x.id === n.id)!;
      expect(n.x).toBeCloseTo(m.x, 5);
      expect(n.y).toBeCloseTo(m.y, 5);
    }
  });

  it('horizontal mode → same result as computeHorizontalLayout', () => {
    const base = cloneNodes(buildTree());
    const h1 = computeMindmapLayout(cloneNodes(base), 'horizontal');
    const h2 = computeHorizontalLayout(cloneNodes(base));

    for (const n of h1.nodes) {
      const m = h2.nodes.find(x => x.id === n.id)!;
      expect(n.x).toBeCloseTo(m.x, 5);
      expect(n.y).toBeCloseTo(m.y, 5);
    }
  });

  it('mode switch produces different positions for non-trivial tree', () => {
    const radial = computeMindmapLayout(cloneNodes(buildTree()), 'radial');
    const horiz  = computeMindmapLayout(cloneNodes(buildTree()), 'horizontal');

    // At least one depth-1 node should differ between the two modes
    const diff = radial.nodes.some(rn => {
      const hn = horiz.nodes.find(x => x.id === rn.id);
      return hn && (Math.abs(rn.x - hn.x) > 1 || Math.abs(rn.y - hn.y) > 1);
    });
    expect(diff).toBe(true);
  });
});
