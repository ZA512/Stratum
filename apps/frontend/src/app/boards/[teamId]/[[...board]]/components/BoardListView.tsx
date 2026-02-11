"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchBoardDetail, fetchChildBoards, fetchNodeBreadcrumb, type Board, type BoardNode, type ColumnBehaviorKey, type NodeBreadcrumbItem, type NodeChildBoard } from "@/features/boards/boards-api";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

type BoardHierarchyEntry = {
  board: Board;
  breadcrumb: NodeBreadcrumbItem[];
  childBoards: NodeChildBoard[];
};

export type BoardListFilters = {
  mode: "all" | "due";
  dueRange: "today" | "week";
  includeOverdue: boolean;
  includeUpcoming: boolean;
  includeDone: boolean;
};

export const DEFAULT_LIST_FILTERS: BoardListFilters = {
  mode: "all",
  dueRange: "today",
  includeOverdue: true,
  includeUpcoming: true,
  includeDone: false,
};

type BoardListViewProps = {
  rootBoard: Board;
  filters: BoardListFilters;
  onFiltersChange: (next: BoardListFilters) => void;
  onOpenTask: (id: string) => void;
  onOpenBoard: (boardId: string) => void;
};

type ListRow = {
  id: string;
  shortId: number | null;
  title: string;
  dueAt: string | null;
  dueDiff: number | null;
  boardId: string;
  boardName: string;
  columnName: string;
  columnBehavior: ColumnBehaviorKey;
  breadcrumb: NodeBreadcrumbItem[];
  position: number;
  assignees: string[];
  priority: BoardNode["priority"];
  childBoardId: string | null;
};

const priorityWeight: Record<NonNullable<BoardNode["priority"]>, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  LOWEST: 4,
  NONE: 5,
};

const toStartOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate());

const getDueDiff = (dueAt: string | null): number | null => {
  if (!dueAt) return null;
  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) return null;
  const today = toStartOfDay(new Date());
  const startDue = toStartOfDay(dueDate);
  return Math.round((startDue.getTime() - today.getTime()) / DAY_IN_MS);
};

export function BoardListView({
  rootBoard,
  filters,
  onFiltersChange,
  onOpenTask,
  onOpenBoard,
}: BoardListViewProps) {
  const { accessToken } = useAuth();
  const { t: tBoard, locale } = useTranslation("board");
  const [hierarchy, setHierarchy] = useState<BoardHierarchyEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHierarchy = useCallback(async () => {
    if (!accessToken || !rootBoard) return;
    setLoading(true);
    setError(null);

    const entries: BoardHierarchyEntry[] = [];
    const seen = new Set<string>();

    const fetchEntry = async (boardId: string): Promise<BoardHierarchyEntry | null> => {
      const detail = boardId === rootBoard.id
        ? rootBoard
        : await fetchBoardDetail(boardId, accessToken);
      if (!detail) return null;
      const [breadcrumb, childBoards] = await Promise.all([
        fetchNodeBreadcrumb(detail.nodeId, accessToken),
        fetchChildBoards(detail.nodeId, accessToken),
      ]);
      return { board: detail, breadcrumb, childBoards };
    };

    try {
      let batch: string[] = [rootBoard.id];
      while (batch.length > 0) {
        const pending = batch.filter((boardId) => !seen.has(boardId));
        pending.forEach((boardId) => seen.add(boardId));
        const results = await Promise.all(pending.map((boardId) => fetchEntry(boardId)));
        const nextBatch: string[] = [];

        for (const entry of results) {
          if (!entry) continue;
          entries.push(entry);
          for (const child of entry.childBoards) {
            if (!seen.has(child.boardId)) {
              nextBatch.push(child.boardId);
            }
          }
        }

        batch = nextBatch;
      }

      setHierarchy(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : tBoard("listView.errors.hierarchy"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, rootBoard, tBoard]);

  useEffect(() => {
    void loadHierarchy();
  }, [loadHierarchy]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );

  const rows = useMemo(() => {
    const output: ListRow[] = [];

    for (const entry of hierarchy) {
      const childMap = new Map<string, string>();
      entry.childBoards.forEach((child) => {
        childMap.set(child.nodeId, child.boardId);
      });

      entry.board.columns.forEach((column) => {
        const behavior = column.behaviorKey;
        const columnName = column.name;
        (column.nodes ?? []).forEach((node) => {
          const dueDiff = getDueDiff(node.dueAt ?? null);
          output.push({
            id: node.id,
            shortId: typeof node.shortId === "number" ? node.shortId : null,
            title: node.title,
            dueAt: node.dueAt ?? null,
            dueDiff,
            boardId: entry.board.id,
            boardName: entry.board.name,
            columnName,
            columnBehavior: behavior,
            breadcrumb: entry.breadcrumb,
            position: node.position,
            assignees: (node.assignees ?? []).map((assignee) => assignee.displayName),
            priority: node.priority ?? "NONE",
            childBoardId: childMap.get(node.id) ?? null,
          });
        });
      });
    }

    return output;
  }, [hierarchy]);

  const filteredRows = useMemo(() => {
    const rangeDays = filters.dueRange === "week" ? 7 : 0;
    const result = rows.filter((row) => {
      if (!filters.includeDone && row.columnBehavior === "DONE") return false;
      if (filters.mode !== "due") return true;
      if (row.dueDiff === null) return false;
      const isOverdue = row.dueDiff < 0;
      const isUpcoming = row.dueDiff >= 0 && row.dueDiff <= rangeDays;
      if (isOverdue && filters.includeOverdue) return true;
      if (isUpcoming && filters.includeUpcoming) return true;
      return false;
    });

    return result.sort((a, b) => {
      if (filters.mode === "due") {
        const aDiff = a.dueDiff ?? Number.POSITIVE_INFINITY;
        const bDiff = b.dueDiff ?? Number.POSITIVE_INFINITY;
        if (aDiff !== bDiff) return aDiff - bDiff;
      } else {
        const aDue = a.dueDiff ?? Number.POSITIVE_INFINITY;
        const bDue = b.dueDiff ?? Number.POSITIVE_INFINITY;
        if (aDue !== bDue) return aDue - bDue;
      }
      const aPriority = priorityWeight[a.priority ?? "NONE"];
      const bPriority = priorityWeight[b.priority ?? "NONE"];
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.boardName !== b.boardName) return a.boardName.localeCompare(b.boardName, locale);
      if (a.columnName !== b.columnName) return a.columnName.localeCompare(b.columnName, locale);
      if (a.position !== b.position) return a.position - b.position;
      return a.title.localeCompare(b.title, locale);
    });
  }, [filters, locale, rows]);

  const summary = useMemo(() => {
    let overdue = 0;
    let upcoming = 0;
    for (const row of filteredRows) {
      if (row.dueDiff === null) continue;
      if (row.dueDiff < 0) overdue += 1;
      else upcoming += 1;
    }
    return { total: filteredRows.length, overdue, upcoming };
  }, [filteredRows]);

  const pillClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition ${
      active
        ? "border-accent bg-accent/10 text-foreground"
        : "border-white/15 text-muted hover:border-accent hover:text-foreground"
    }`;

  const renderDueLabel = (dueDiff: number | null) => {
    if (dueDiff === null) return tBoard("listView.due.none");
    if (dueDiff === 0) return tBoard("listView.due.today");
    if (dueDiff > 0) return tBoard("listView.due.inDays", { count: dueDiff });
    return tBoard("listView.due.overdue", { count: Math.abs(dueDiff) });
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card/60 p-6 text-sm text-muted">
        {tBoard("listView.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-card/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, mode: "all" })}
            className={pillClass(filters.mode === "all")}
            aria-pressed={filters.mode === "all"}
          >
            {tBoard("listView.mode.all")}
          </button>
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, mode: "due" })}
            className={pillClass(filters.mode === "due")}
            aria-pressed={filters.mode === "due"}
          >
            {tBoard("listView.mode.due")}
          </button>
        </div>
        {filters.mode === "due" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, includeOverdue: !filters.includeOverdue })}
              className={pillClass(filters.includeOverdue)}
              aria-pressed={filters.includeOverdue}
            >
              {tBoard("listView.filters.overdue")}
            </button>
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, includeUpcoming: !filters.includeUpcoming })}
              className={pillClass(filters.includeUpcoming)}
              aria-pressed={filters.includeUpcoming}
            >
              {tBoard("listView.filters.upcoming")}
            </button>
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, dueRange: "today" })}
              className={pillClass(filters.dueRange === "today")}
              aria-pressed={filters.dueRange === "today"}
            >
              {tBoard("listView.range.today")}
            </button>
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, dueRange: "week" })}
              className={pillClass(filters.dueRange === "week")}
              aria-pressed={filters.dueRange === "week"}
            >
              {tBoard("listView.range.week")}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => onFiltersChange({ ...filters, includeDone: !filters.includeDone })}
          className={pillClass(filters.includeDone)}
          aria-pressed={filters.includeDone}
        >
          {tBoard("listView.filters.includeDone")}
        </button>
        <span className="text-xs uppercase tracking-wide text-muted">
          {filters.mode === "due"
            ? tBoard("listView.summary.due", { total: summary.total, overdue: summary.overdue, upcoming: summary.upcoming })
            : tBoard("listView.summary.all", { total: summary.total })}
        </span>
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-card/60 p-8 text-center">
          <p className="text-sm text-muted">{tBoard("listView.empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => {
            const breadcrumbLabels = row.breadcrumb.map((item) => item.title);
            const context = [...breadcrumbLabels, row.boardName].filter(Boolean).join(" / ");
            const dueLabel = renderDueLabel(row.dueDiff);
            const dueDate = row.dueAt ? dateFormatter.format(new Date(row.dueAt)) : null;
            const priorityLabel = tBoard(`priority.labels.${row.priority ?? "NONE"}`);

            return (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenTask(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTask(row.id);
                  }
                }}
                className="grid gap-3 rounded-2xl border border-white/10 bg-card/70 px-5 py-4 text-sm transition hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:grid-cols-[minmax(0,2fr)_160px_140px_minmax(0,1.2fr)]"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {row.shortId !== null && (
                      <span className="text-xs font-semibold text-muted">#{row.shortId}</span>
                    )}
                    <span className="text-base font-semibold text-foreground">{row.title}</span>
                  </div>
                  <div className="text-xs text-muted">
                    {context}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>{row.columnName}</span>
                    <span>•</span>
                    <span>{priorityLabel}</span>
                    {row.assignees.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{row.assignees.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted">{tBoard("listView.columns.due")}</div>
                  <div className="text-sm font-semibold text-foreground">{dueLabel}</div>
                  {dueDate && <div className="text-xs text-muted">{dueDate}</div>}
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted">{tBoard("listView.columns.status")}</div>
                  <div className="inline-flex w-fit rounded-full border border-white/15 px-2 py-1 text-xs font-semibold text-muted">
                    {tBoard(`behaviors.${row.columnBehavior}`)}
                  </div>
                </div>
                <div className="flex flex-col items-start justify-between gap-2">
                  <div className="text-xs uppercase tracking-wide text-muted">{tBoard("listView.columns.context")}</div>
                  <div className="text-xs text-muted line-clamp-2">{context}</div>
                  {row.childBoardId && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenBoard(row.childBoardId!);
                      }}
                      className="text-xs font-semibold text-accent transition hover:text-accent-strong"
                    >
                      {tBoard("listView.actions.openChild")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BoardListView;
