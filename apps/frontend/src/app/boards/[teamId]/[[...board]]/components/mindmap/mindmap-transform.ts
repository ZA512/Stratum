import type { Board, NodeChildBoard } from '@/features/boards/boards-api';
import type { MindmapNode, MindmapEdge } from './mindmap-types';

// ---------------------------------------------------------------------------
// Board → MindmapNode[] transformation
// ---------------------------------------------------------------------------

/**
 * Transforms a Board + childBoards + loaded subtrees into a flat MindmapNode[]
 * suitable for radial layout.
 */
export function transformBoardToMindmapTree(
  board: Board,
  childBoards: Record<string, NodeChildBoard>,
  loadedSubtrees: Map<string, MindmapNode[]>,
  collapsedIds: Set<string>,
): MindmapNode[] {
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
    collapsed: collapsedIds.has(board.nodeId),
    assignees: [],
    dueAt: null,
    x: 0, y: 0, angle: 0, radius: 0,
  };

  const nodes: MindmapNode[] = [rootNode];

  // Direct children (all columns, sorted by position)
  const allBoardNodes = board.columns
    .flatMap(col => (col.nodes ?? []).map(n => ({ ...n, behaviorKey: col.behaviorKey })))
    .sort((a, b) => a.position - b.position);

  if (!rootNode.collapsed) {
    for (const node of allBoardNodes) {
      const mindmapNode: MindmapNode = {
        id: node.id,
        parentId: board.nodeId,
        title: node.title,
        depth: 1,
        progress: node.progress ?? 0,
        priority: node.priority ?? 'NONE',
        effort: node.effort ?? null,
        behaviorKey: node.behaviorKey,
        hasChildren: Boolean(childBoards[node.id]),
        childrenLoaded: loadedSubtrees.has(node.id),
        collapsed: collapsedIds.has(node.id),
        assignees: node.assignees ?? [],
        dueAt: node.dueAt,
        x: 0, y: 0, angle: 0, radius: 0,
      };
      nodes.push(mindmapNode);

      // Inject loaded subtree with depthOffset
      if (!mindmapNode.collapsed && loadedSubtrees.has(node.id)) {
        const subtreeNodes = loadedSubtrees.get(node.id)!;
        const depthOffset = mindmapNode.depth;
        for (const sub of subtreeNodes) {
          nodes.push({ ...sub, depth: sub.depth + depthOffset });
        }
      }
    }
  }

  return nodes;
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
      x: 0, y: 0, angle: 0, radius: 0,
    });
  }

  // Dev-only coherence assertion
  if (process.env.NODE_ENV === 'development') {
    const idSet = new Set(nodes.map(n => n.id));
    for (const node of nodes) {
      if (node.parentId !== parentNodeId && !idSet.has(node.parentId!)) {
        console.error(
          `[transformSubBoardToNodes] orphan parentId: node ${node.id} has parentId=${node.parentId} not present in subtree`,
        );
      }
    }
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
