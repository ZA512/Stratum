'use client';

import React, { useMemo } from 'react';
import { Text } from 'react-konva';
import type { MindmapNode, LabelPlacement } from './mindmap-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MindmapLabelsLayerProps {
  placements: LabelPlacement[];
  nodes: MindmapNode[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function truncateText(text: string, maxWidth: number): string {
  // Approximate: ~7px per character at 12px font
  const maxChars = Math.floor(maxWidth / 7);
  if (text.length <= maxChars) return text;
  return text.substring(0, Math.max(maxChars - 1, 1)) + '…';
}

function MindmapLabelsLayerInner({ placements, nodes }: MindmapLabelsLayerProps) {
  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes],
  );

  return (
    <>
      {placements.map(p => {
        if (!p.visible) return null;
        const node = nodeMap.get(p.nodeId);
        if (!node) return null;

        const truncated = truncateText(node.title, p.maxWidth);

        return (
          <Text
            key={p.nodeId}
            x={p.x}
            y={p.y - 6}
            text={truncated}
            fontSize={12}
            fill="#e5e7eb"
            align={p.anchor === 'left' ? 'left' : 'right'}
            width={p.maxWidth}
            listening={false}
          />
        );
      })}
    </>
  );
}

export const MindmapLabelsLayer = React.memo(MindmapLabelsLayerInner);
