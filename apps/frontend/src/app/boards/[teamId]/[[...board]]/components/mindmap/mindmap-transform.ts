import type { Board, NodeChildBoard } from '@/features/boards/boards-api';
import type { MindmapNode, MindmapEdge } from './mindmap-types';

// ---------------------------------------------------------------------------
// Board → MindmapNode[] transformation
// ---------------------------------------------------------------------------

/**
 * Transforms a Board + childBoards + loaded subtrees into a flat MindmapNode[]
 * suitable for radial layout.
 */
/**
 * @param collapsedIds – `null` means first visit: root expanded, all children collapsed.
 */
export function transformBoardToMindmapTree(
  board: Board,
  childBoards: Record<string, NodeChildBoard>,
  loadedSubtrees: Map<string, MindmapNode[]>,
  collapsedIds: Set<string> | null,
): MindmapNode[] {
  // When collapsedIds is null (first visit), root is expanded, all depth≥1 are collapsed.
  const isCollapsed = (id: string, depth: number): boolean => {
    if (collapsedIds === null) return depth > 0;
    return collapsedIds.has(id);
  };

  const rootNode: MindmapNode = {
    id: board.nodeId,
    parentId: null,
    title: board.name,
    depth: 0,
    progress: 0,
    priority: 'NONE',
    effort: null,
    behaviorKey: null,
    hasChildren: true,
    childrenLoaded: true,
    collapsed: isCollapsed(board.nodeId, 0),
    assignees: [],
    dueAt: null,
    description: null,
    shortId: null,
    counts: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };

  const nodes: MindmapNode[] = [rootNode];

  // Direct children (all columns, sorted by position)
  const allBoardNodes = board.columns
    .flatMap(col => (col.nodes ?? []).map(n => ({ ...n, behaviorKey: col.behaviorKey })))
    .sort((a, b) => a.position - b.position);

  if (!rootNode.collapsed) {
    for (const node of allBoardNodes) {
      const subtreeNodes = loadedSubtrees.get(node.id);
      const childrenLoaded = loadedSubtrees.has(node.id);

      // hasRealChildren: once loaded, check actual content; before loading, trust childBoards
      const hasRealChildren = childrenLoaded
        ? (subtreeNodes != null && subtreeNodes.length > 0)
        : Boolean(childBoards[node.id]);

      const depth = 1;
      const collapsed = isCollapsed(node.id, depth);

      const mindmapNode: MindmapNode = {
        id: node.id,
        parentId: board.nodeId,
        title: node.title,
        depth,
        progress: node.progress ?? 0,
        priority: node.priority ?? 'NONE',
        effort: node.effort ?? null,
        behaviorKey: node.behaviorKey,
        hasChildren: hasRealChildren,
        childrenLoaded,
        collapsed,
        assignees: node.assignees ?? [],
        dueAt: node.dueAt,
        description: node.description ?? null,
        shortId: typeof node.shortId === 'number' ? node.shortId : null,
        counts: node.counts ?? null,
        x: 0, y: 0, angle: 0, radius: 0,
      };
      nodes.push(mindmapNode);

      // Recursively inject loaded subtrees
      if (!collapsed && childrenLoaded && subtreeNodes && subtreeNodes.length > 0) {
        injectSubtrees(nodes, depth, subtreeNodes, loadedSubtrees, isCollapsed);
      }
    }
  }

  return nodes;
}

/**
 * Recursively injects loaded subtree nodes with correct depth, collapsed,
 * childrenLoaded, and hasChildren overrides.
 */
function injectSubtrees(
  nodes: MindmapNode[],
  parentDepth: number,
  subtreeNodes: MindmapNode[],
  loadedSubtrees: Map<string, MindmapNode[]>,
  isCollapsed: (id: string, depth: number) => boolean,
): void {
  for (const sub of subtreeNodes) {
    const depth = sub.depth + parentDepth;
    const collapsed = isCollapsed(sub.id, depth);
    const childrenLoaded = loadedSubtrees.has(sub.id);

    // Override hasChildren: once loaded, check actual content
    let hasChildren = sub.hasChildren;
    if (childrenLoaded) {
      const childSubtree = loadedSubtrees.get(sub.id);
      hasChildren = childSubtree != null && childSubtree.length > 0;
    }

    const adjustedNode: MindmapNode = {
      ...sub,
      depth,
      collapsed,
      childrenLoaded,
      hasChildren,
    };
    nodes.push(adjustedNode);

    // Recurse into this node's loaded subtree
    if (!collapsed && hasChildren && childrenLoaded) {
      const childSubtree = loadedSubtrees.get(sub.id);
      if (childSubtree && childSubtree.length > 0) {
        injectSubtrees(nodes, depth, childSubtree, loadedSubtrees, isCollapsed);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// transformSubBoardToNodes — contract for loadedSubtrees
// ---------------------------------------------------------------------------

/**
 * Transforms a sub-board detail into MindmapNode[] with **relative depths**.
 *
 * Invariants:
 * 1. Depths relative ≥ 1 (direct children = 1)
 * 2. Direct children have parentId = parentNodeId
 * 3. All referenced parentIds exist in the list or equal parentNodeId
 * 4. The parent node itself is NOT included
 */
export function transformSubBoardToNodes(
  parentNodeId: string,
  subBoardDetail: Board,
  childBoardsData: Record<string, NodeChildBoard>,
): MindmapNode[] {
  const nodes: MindmapNode[] = [];

  const allSubNodes = subBoardDetail.columns
    .flatMap(col => (col.nodes ?? []).map(n => ({ ...n, behaviorKey: col.behaviorKey })))
    .sort((a, b) => a.position - b.position);

  for (const node of allSubNodes) {
    nodes.push({
      id: node.id,
      parentId: parentNodeId,
      title: node.title,
      depth: 1,
      progress: node.progress ?? 0,
      priority: node.priority ?? 'NONE',
      effort: node.effort ?? null,
      behaviorKey: node.behaviorKey,
      hasChildren: Boolean(childBoardsData[node.id]),
      childrenLoaded: false,
      collapsed: true,
      assignees: node.assignees ?? [],
      dueAt: node.dueAt,
      description: node.description ?? null,
      shortId: typeof node.shortId === 'number' ? node.shortId : null,
      counts: node.counts ?? null,
      x: 0, y: 0, angle: 0, radius: 0,
    });
  }


  return nodes;
}

// ---------------------------------------------------------------------------
// buildEdges
// ---------------------------------------------------------------------------

export function buildEdges(nodes: MindmapNode[]): MindmapEdge[] {
  return nodes
    .filter(n => n.parentId !== null)
    .map(n => ({ sourceId: n.parentId!, targetId: n.id }));
}
