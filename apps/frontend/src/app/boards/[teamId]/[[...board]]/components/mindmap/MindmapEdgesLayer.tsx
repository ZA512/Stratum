'use client';

import React, { useMemo, useCallback } from 'react';
import { Path } from 'react-konva';
import type Konva from 'konva';
import type { MindmapEdge, MindmapNode } from './mindmap-types';
import { useTheme } from '@/themes/theme-provider';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MindmapEdgesLayerProps {
  edges: MindmapEdge[];
  nodes: MindmapNode[];
  registerEdgeRef?: (key: string, ref: Konva.Path | null) => void;
}

// ---------------------------------------------------------------------------
// Bézier path helper
// ---------------------------------------------------------------------------

export function computeBezierPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
): string {
  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;
  const ctrlX = source.x + (midX - source.x) * 0.5;
  const ctrlY = source.y + (midY - source.y) * 0.5;
  return `M${source.x},${source.y} Q${ctrlX},${ctrlY} ${target.x},${target.y}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function MindmapEdgesLayerInner({ edges, nodes, registerEdgeRef }: MindmapEdgesLayerProps) {
  const { activeTheme } = useTheme();
  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes],
  );

  const edgeStroke = activeTheme.tone === 'light'
    ? activeTheme.cssVars['--color-border-strong']
    : activeTheme.cssVars['--color-border'];

  const handleRef = useCallback(
    (key: string) => (ref: Konva.Path | null) => {
      registerEdgeRef?.(key, ref);
    },
    [registerEdgeRef],
  );

  return (
    <>
      {edges.map(edge => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;

        const key = `${edge.sourceId}-${edge.targetId}`;
        return (
          <Path
            key={key}
            ref={handleRef(key)}
            data={computeBezierPath(source, target)}
            stroke={edgeStroke}
            strokeWidth={activeTheme.tone === 'light' ? 1.8 : 1.5}
            opacity={activeTheme.tone === 'light' ? 0.92 : 0.82}
            listening={false}
          />
        );
      })}
    </>
  );
}

export const MindmapEdgesLayer = React.memo(MindmapEdgesLayerInner);
