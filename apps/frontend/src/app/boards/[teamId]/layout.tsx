"use client";

import React from "react";
import { BoardDataProvider, useBoardData } from "@/features/boards/board-data-provider";
import { BoardUiSettingsProvider, useBoardUiSettings } from "@/features/boards/board-ui-settings";
import { FractalBreadcrumb } from "@/components/fractal-breadcrumb";
import { TaskDrawerProvider } from "@/features/nodes/task-drawer/TaskDrawerContext";
import { TaskDrawer } from "@/features/nodes/task-drawer/TaskDrawer";

function TeamBoardsShell({ children }: { children: React.ReactNode }) {
  const { breadcrumb, registerDescendTrigger, teamId, prefetchBoard } = useBoardData();
  const { boardView } = useBoardUiSettings();

  if (boardView === "list") {
    return (
      <div className="pt-[76px]">
        <div id="board-fixed-header-root" className="fixed top-0 left-0 right-0 z-50" />
        {children}
      </div>
    );
  }

  return (
    <div className="pt-[76px]">
      <div id="board-fixed-header-root" className="fixed top-0 left-0 right-0 z-50" />
      <FractalBreadcrumb
        items={breadcrumb}
        offsetX={56}
        offsetY={40}
        labelWidth={220}
        visibleTrailingCount={8}
        animated
        travelAnimation
        enableDescendAnimation
        travelDuration={0.5}
        ascendOvershootFactor={0.25}
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
    </div>
  );
}

export default function TeamBoardsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BoardDataProvider>
      <BoardUiSettingsProvider>
        <TaskDrawerProvider>
          <TeamBoardsShell>{children}</TeamBoardsShell>
          <TaskDrawer />
        </TaskDrawerProvider>
      </BoardUiSettingsProvider>
    </BoardDataProvider>
  );
}
