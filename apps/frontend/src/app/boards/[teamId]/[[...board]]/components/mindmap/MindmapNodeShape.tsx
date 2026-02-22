'use client';

import React, { useCallback } from 'react';
import { Group, Rect, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import type { MindmapNode } from './mindmap-types';
import { LAYOUT_CONSTANTS } from './mindmap-types';

// ---------------------------------------------------------------------------
// Color palette per behaviorKey — used for left priority stripe
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

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f43f5e',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
  LOWEST: '#64748b',
  NONE: 'transparent',
};

export function getNodeColor(node: MindmapNode): string {
  if (node.depth === 0) return ROOT_COLOR;
  return BEHAVIOR_COLORS[node.behaviorKey ?? ''] ?? DEFAULT_COLOR;
}

function getPriorityColor(priority: string): string {
  return PRIORITY_COLORS[priority] ?? 'transparent';
}

// ---------------------------------------------------------------------------
// Text truncation helper
// ---------------------------------------------------------------------------

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, Math.max(maxChars - 1, 1)) + '…';
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
  onContextMenu: (nodeId: string, evt: Konva.KonvaEventObject<PointerEvent | MouseEvent>) => void;
  onHoverStart: (nodeId: string) => void;
  onHoverEnd: (nodeId: string) => void;
  registerRef?: (nodeId: string, ref: Konva.Group | null) => void;
  // Bling mode
  isBling?: boolean;
  onBlingDragStart?: (nodeId: string) => void;
  onBlingDragMove?: (nodeId: string, ox: number, oy: number) => void;
  onBlingDragEnd?: (nodeId: string) => void;
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
  onContextMenu,
  onHoverStart,
  onHoverEnd,
  registerRef,
  isBling = false,
  onBlingDragStart,
  onBlingDragMove,
  onBlingDragEnd,
}: MindmapNodeShapeProps) {
  const isRoot = node.depth === 0;
  const w = isRoot ? LAYOUT_CONSTANTS.ROOT_WIDTH : LAYOUT_CONSTANTS.NODE_WIDTH;
  const h = isRoot ? LAYOUT_CONSTANTS.ROOT_HEIGHT : LAYOUT_CONSTANTS.NODE_HEIGHT;
  const halfW = w / 2;
  const halfH = h / 2;

  const refCallback = useCallback(
    (ref: Konva.Group | null) => registerRef?.(node.id, ref),
    [registerRef, node.id],
  );

  const maxTitleChars = Math.floor((w - 20) / 7);
  const displayTitle = truncateText(node.title, maxTitleChars);
  const priorityColor = getPriorityColor(node.priority);
  const accentColor = getNodeColor(node);

  return (
    <Group
      x={node.x}
      y={node.y}
      ref={refCallback}
      draggable={isBling}
      onDragStart={isBling ? (e) => {
        e.cancelBubble = true;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grabbing';
        onBlingDragStart?.(node.id);
      } : undefined}
      onDragMove={isBling ? (e) => {
        e.cancelBubble = true;
        const g = e.target as Konva.Group;
        onBlingDragMove?.(node.id, g.x() - node.x, g.y() - node.y);
      } : undefined}
      onDragEnd={isBling ? (e) => {
        e.cancelBubble = true;
        const stage = e.target.getStage();
        if (stage) stage.container().style.cursor = 'grab';
        onBlingDragEnd?.(node.id);
      } : undefined}
    >
      {/* Card background */}
      <Rect
        x={-halfW}
        y={-halfH}
        width={w}
        height={h}
        fill="#1a1d24"
        stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.1)'}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={8}
        shadowBlur={isSelected ? 10 : 0}
        shadowColor={isSelected ? '#ffffff' : undefined}
        opacity={isLoading ? 0.6 : 1}
        onClick={() => onSelect(node.id)}
        onDblClick={() => onOpenTask(node.id)}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          e.cancelBubble = true;
          onContextMenu(node.id, e);
        }}
        onMouseEnter={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = isBling ? 'grab' : 'default';
          onHoverStart(node.id);
        }}
        onMouseLeave={(e) => {
          const stage = e.target.getStage();
          if (stage) stage.container().style.cursor = 'grab';
          onHoverEnd(node.id);
        }}
      />

      {/* Left accent stripe (behavior color) */}
      <Rect
        x={-halfW}
        y={-halfH + 4}
        width={3}
        height={h - 8}
        fill={accentColor}
        cornerRadius={[2, 0, 0, 2]}
        listening={false}
      />

      {/* Priority dot */}
      {node.priority !== 'NONE' && (
        <Circle
          x={-halfW + 14}
          y={-halfH + 12}
          radius={4}
          fill={priorityColor}
          listening={false}
        />
      )}

      {/* Title text */}
      <Text
        x={-halfW + (node.priority !== 'NONE' ? 24 : 12)}
        y={-halfH + 7}
        width={w - (node.priority !== 'NONE' ? 36 : 24)}
        height={h - 14}
        text={displayTitle}
        fontSize={isRoot ? 12 : 11}
        fontStyle={isRoot ? 'bold' : 'normal'}
        fill="#e5e7eb"
        verticalAlign="middle"
        listening={false}
        ellipsis
        wrap="none"
      />

      {/* Progress bar at bottom */}
      {node.progress > 0 && (
        <>
          <Rect
            x={-halfW + 4}
            y={halfH - 4}
            width={w - 8}
            height={2}
            fill="rgba(255,255,255,0.08)"
            cornerRadius={1}
            listening={false}
          />
          <Rect
            x={-halfW + 4}
            y={halfH - 4}
            width={(w - 8) * Math.min(node.progress / 100, 1)}
            height={2}
            fill={accentColor}
            cornerRadius={1}
            listening={false}
          />
        </>
      )}

      {/* Expand/collapse badge — only if node truly has children */}
      {node.hasChildren && (
        <Group x={halfW + 2} y={0}>
          {/* Hit zone */}
          <Circle
            radius={12}
            fill="transparent"
            onClick={(e) => {
              e.cancelBubble = true;
              onExpand(node.id);
            }}
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'pointer';
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
          />
          {/* Visual badge */}
          <Circle
            radius={LAYOUT_CONSTANTS.COLLAPSE_INDICATOR_SIZE}
            fill="#ffffff"
            listening={false}
          />
          <Text
            text={(node.collapsed || !node.childrenLoaded) ? '+' : '−'}
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
