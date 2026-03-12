"use client";

import React from "react";
import { BoardDataProvider, useBoardData } from "@/features/boards/board-data-provider";
import { BoardUiSettingsProvider, useBoardUiSettings } from "@/features/boards/board-ui-settings";
import { FractalBreadcrumb } from "@/components/fractal-breadcrumb";
import { InlineBreadcrumb } from "@/components/inline-breadcrumb";
import { StackedBreadcrumb } from "@/components/stacked-breadcrumb";
import { TaskDrawerProvider } from "@/features/nodes/task-drawer/TaskDrawerContext";
import { TaskDrawer } from "@/features/nodes/task-drawer/TaskDrawer";

function TeamBoardsShell({ children }: { children: React.ReactNode }) {
  const { breadcrumb, registerDescendTrigger, teamId, prefetchBoard } = useBoardData();
  const { breadcrumbVariant } = useBoardUiSettings();

  const breadcrumbContent = (() => {
    const commonProps = {
      items: breadcrumb,
      buildHref: (item: (typeof breadcrumb)[number]) => {
        if (!teamId) return "#";
        if (item.boardId) return `/boards/${teamId}/${item.boardId}`;
        return `/boards/${teamId}`;
      },
      onPreNavigate: (item: (typeof breadcrumb)[number]) => {
        if (item.boardId) {
          void prefetchBoard(item.boardId);
        }
      },
    };

    if (breadcrumbVariant === "inline") {
      return <InlineBreadcrumb {...commonProps}>{children}</InlineBreadcrumb>;
    }

    if (breadcrumbVariant === "stacked") {
      return <StackedBreadcrumb {...commonProps}>{children}</StackedBreadcrumb>;
    }

    return (
      <FractalBreadcrumb
        {...commonProps}
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
      >
        {children}
      </FractalBreadcrumb>
    );
  })();

  return (
    <div className="pt-[76px]">
      <div id="board-fixed-header-root" className="fixed top-0 left-0 right-0 z-50" />
      {breadcrumbContent}
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
