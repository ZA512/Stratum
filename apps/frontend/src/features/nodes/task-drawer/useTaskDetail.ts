import { useTaskDrawer } from './TaskDrawerContext';

export function useTaskDetail() {
  const { openedNodeId, detail, loading, error, refresh } = useTaskDrawer();
  return { nodeId: openedNodeId, detail, loading, error, refresh };
}
