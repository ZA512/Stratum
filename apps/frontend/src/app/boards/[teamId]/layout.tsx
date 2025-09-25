"use client";

import React from "react";
import { BoardDataProvider, useBoardData } from "@/features/boards/board-data-provider";
import { FractalBreadcrumb } from "@/components/fractal-breadcrumb";
import { TaskDrawerProvider } from "@/features/nodes/task-drawer/TaskDrawerContext";
import { TaskDrawer } from "@/features/nodes/task-drawer/TaskDrawer";

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
      <TaskDrawerProvider>
        <TeamBoardsShell>{children}</TeamBoardsShell>
        <TaskDrawer />
      </TaskDrawerProvider>
    </BoardDataProvider>
  );
}
