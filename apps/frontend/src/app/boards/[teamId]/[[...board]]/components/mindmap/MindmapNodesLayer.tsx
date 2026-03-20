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
  showMenuButton: boolean;
  onSelect: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  onOpenTaskView: (nodeId: string) => void;
  onOpenTaskEdit: (nodeId: string) => void;
  onNavigateChild: (nodeId: string) => void;
  onContextMenu: (nodeId: string, evt: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => void;
  onHoverStart: (nodeId: string) => void;
  onHoverEnd: (nodeId: string) => void;
  registerRef?: (nodeId: string, ref: Konva.Group | null) => void;
  // Search highlight
  matchedNodeIds?: Set<string>;
  // Bling mode
  isBling?: boolean;
  onBlingDragStart?: (nodeId: string) => void;
  onBlingDragMove?: (nodeId: string, ox: number, oy: number) => void;
  onBlingDragEnd?: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MindmapNodesLayerInner({
  nodes,
  selectedId,
  loadingIds,
  showMenuButton,
  matchedNodeIds,
  onSelect,
  onExpand,
  onOpenTaskView,
  onOpenTaskEdit,
  onNavigateChild,
  onContextMenu,
  onHoverStart,
  onHoverEnd,
  registerRef,
  isBling,
  onBlingDragStart,
  onBlingDragMove,
  onBlingDragEnd,
}: MindmapNodesLayerProps) {
  return (
    <>
      {nodes.map(node => (
        <MindmapNodeShape
          key={node.id}
          node={node}
          isSelected={node.id === selectedId}
          isLoading={loadingIds.has(node.id)}
          isSearchMatch={matchedNodeIds != null && matchedNodeIds.size > 0 && matchedNodeIds.has(node.id)}
          showMenuButton={showMenuButton}
          onSelect={onSelect}
          onExpand={onExpand}
          onOpenTaskView={onOpenTaskView}
          onOpenTaskEdit={onOpenTaskEdit}
          onNavigateChild={onNavigateChild}
          onContextMenu={onContextMenu}
          onHoverStart={onHoverStart}
          onHoverEnd={onHoverEnd}
          registerRef={registerRef}
          isBling={isBling}
          onBlingDragStart={onBlingDragStart}
          onBlingDragMove={onBlingDragMove}
          onBlingDragEnd={onBlingDragEnd}
        />
      ))}
    </>
  );
}

export const MindmapNodesLayer = React.memo(MindmapNodesLayerInner);
