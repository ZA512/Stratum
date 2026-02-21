'use client';

import React from 'react';
import type Konva from 'konva';
import type { MindmapNode } from './mindmap-types';
import { MindmapNodeShape } from './MindmapNodeShape';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MindmapNodesLayerProps {
  nodes: MindmapNode[];
  selectedId: string | null;
  loadingIds: Set<string>;
  onSelect: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  onOpenTask: (nodeId: string) => void;
  onNavigateChild: (nodeId: string) => void;
  onHoverStart: (nodeId: string) => void;
  onHoverEnd: (nodeId: string) => void;
  registerRef?: (nodeId: string, ref: Konva.Group | null) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MindmapNodesLayerInner({
  nodes,
  selectedId,
  loadingIds,
  onSelect,
  onExpand,
  onOpenTask,
  onNavigateChild,
  onHoverStart,
  onHoverEnd,
  registerRef,
}: MindmapNodesLayerProps) {
  return (
    <>
      {nodes.map(node => (
        <MindmapNodeShape
          key={node.id}
          node={node}
          isSelected={node.id === selectedId}
          isLoading={loadingIds.has(node.id)}
          onSelect={onSelect}
          onExpand={onExpand}
          onOpenTask={onOpenTask}
          onNavigateChild={onNavigateChild}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
          registerRef={registerRef}
        />
      ))}
    </>
  );
}

export const MindmapNodesLayer = React.memo(MindmapNodesLayerInner);
