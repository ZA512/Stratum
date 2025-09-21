"use client";

import React from "react";
import { BoardDataProvider, useBoardData } from "@/features/boards/board-data-provider";
import { FractalBreadcrumb } from "@/components/fractal-breadcrumb";

function TeamBoardsShell({ children }: { children: React.ReactNode }) {
  const { breadcrumb, registerDescendTrigger, teamId, prefetchBoard } = useBoardData();
  return (
    <FractalBreadcrumb
      items={breadcrumb}
      offsetX={56}
      offsetY={40}
      labelWidth={220}
      visibleTrailingCount={8}
      registerDescend={registerDescendTrigger}
      buildHref={(item) => {
        if (!teamId) return "#";
        if (item.boardId) return `/boards/${teamId}/${item.boardId}`;
        return `/boards/${teamId}`;
      }}
      onPreNavigate={(item) => { if (item.boardId) prefetchBoard(item.boardId); }}
    >
      {children}
    </FractalBreadcrumb>
  );
}

export default function TeamBoardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BoardDataProvider>
      <TeamBoardsShell>{children}</TeamBoardsShell>
    </BoardDataProvider>
  );
}
