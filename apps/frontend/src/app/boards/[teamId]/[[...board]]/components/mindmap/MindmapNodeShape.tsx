'use client';

import React, { useCallback } from 'react';
import { Group, Circle, Arc, Text } from 'react-konva';
import type Konva from 'konva';
import type { MindmapNode } from './mindmap-types';
import { LAYOUT_CONSTANTS } from './mindmap-types';

// ---------------------------------------------------------------------------
// Color palette per behaviorKey
// ---------------------------------------------------------------------------

const BEHAVIOR_COLORS: Record<string, string> = {
  BACKLOG: '#fbbf24',     // amber-400
  IN_PROGRESS: '#38bdf8', // sky-400
  BLOCKED: '#fb7185',     // rose-400
  DONE: '#34d399',        // emerald-400
  CUSTOM: '#94a3b8',      // slate-400
};
const ROOT_COLOR = '#a78bfa'; // violet-400 accent
const DEFAULT_COLOR = '#94a3b8';

export function getNodeColor(node: MindmapNode): string {
  if (node.depth === 0) return ROOT_COLOR;
  return BEHAVIOR_COLORS[node.behaviorKey ?? ''] ?? DEFAULT_COLOR;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MindmapNodeShapeProps {
  node: MindmapNode;
  isSelected: boolean;
  isLoading: boolean;
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

function MindmapNodeShapeInner({
  node,
  isSelected,
  isLoading,
  onSelect,
  onExpand,
  onOpenTask,
  onNavigateChild,
  onHoverStart,
  onHoverEnd,
  registerRef,
}: MindmapNodeShapeProps) {
  const nodeRadius = node.depth === 0
    ? LAYOUT_CONSTANTS.ROOT_RADIUS
    : LAYOUT_CONSTANTS.NODE_RADIUS;

  const refCallback = useCallback(
    (ref: Konva.Group | null) => registerRef?.(node.id, ref),
    [registerRef, node.id],
  );

  return (
    <Group x={node.x} y={node.y} ref={refCallback}>
      {/* Main circle */}
      <Circle
        radius={nodeRadius}
        fill={getNodeColor(node)}
        stroke={isSelected ? '#ffffff' : undefined}
        strokeWidth={isSelected ? 2 : 0}
        shadowBlur={isSelected ? 12 : 0}
        shadowColor={isSelected ? '#ffffff' : undefined}
        opacity={isLoading ? 0.6 : 1}
        onClick={() => onSelect(node.id)}
        onDblClick={() => {
          if (node.hasChildren) {
            onNavigateChild(node.id);
          } else {
            onOpenTask(node.id);
          }
        }}
        onMouseEnter={(e) => {
          e.target.to({ scaleX: 1.15, scaleY: 1.15, duration: 0.15 });
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'pointer';
          onHoverStart(node.id);
        }}
        onMouseLeave={(e) => {
          e.target.to({ scaleX: 1, scaleY: 1, duration: 0.15 });
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grab';
          onHoverEnd(node.id);
        }}
      />

      {/* Progress arc */}
      {node.progress > 0 && (
        <Arc
          innerRadius={nodeRadius + 1}
          outerRadius={nodeRadius + 4}
          angle={(node.progress / 100) * 360}
          rotation={-90}
          fill="rgba(255, 255, 255, 0.7)"
          listening={false}
        />
      )}

      {/* Expand/collapse badge — visible for ALL nodes with children */}
      {node.hasChildren && (
        <Group x={nodeRadius * 0.7} y={nodeRadius * 0.7}>
          {/* Enlarged hit-zone (14px radius) */}
          <Circle
            radius={14}
            fill="transparent"
            onClick={(e) => {
              e.cancelBubble = true;
              onExpand(node.id);
            }}
          />
          {/* Visual badge */}
          <Circle
            radius={LAYOUT_CONSTANTS.COLLAPSE_INDICATOR_SIZE}
            fill="#ffffff"
            listening={false}
          />
          <Text
            text={node.collapsed ? '+' : '−'}
            fontSize={12}
            fontStyle="bold"
            fill="#0f1117"
            align="center"
            verticalAlign="middle"
            offsetX={4}
            offsetY={6}
            listening={false}
          />
        </Group>
      )}
    </Group>
  );
}

export const MindmapNodeShape = React.memo(MindmapNodeShapeInner);
