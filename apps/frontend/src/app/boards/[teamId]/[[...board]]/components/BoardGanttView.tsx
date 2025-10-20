"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useTranslation } from "@/i18n";
import type { BoardColumnWithNodes } from "./types";
import type { GanttDependency, ScheduleChange } from "./BoardPageShell";
import type { BoardNode, NodeChildBoard } from "@/features/boards/boards-api";
import { BEHAVIOR_COLOR_CLASSES } from "./constants";
import {
  Zap,
  Circle,
  CalendarClock,
  Undo2,
  Redo2,
  Plus,
  Minus,
  Trash2,
  Link2,
  Layers,
  Lock,
  Unlock,
} from "lucide-react";

const MS_PER_DAY = 86_400_000;
const LANE_HEIGHT = 60;
const MIN_BAR_WIDTH = 12;

type ZoomLevel = "day" | "week" | "month";

const ZOOM_DAY_WIDTH: Record<ZoomLevel, number> = {
  day: 80,
  week: 52,
  month: 36,
};

type InternalTask = {
  id: string;
  title: string;
  columnId: string;
  columnName: string;
  columnBehavior: BoardColumnWithNodes["behaviorKey"];
  colorClass: string;
  start: Date;
  end: Date;
  dueAt: Date | null;
  duration: number;
  progress: number | null;
  hasChildBoard: boolean;
  parentId: string | null;
  scheduleMode: "manual" | "asap" | null;
  hardConstraint: boolean;
};

type HistoryEntry = {
  redo: ScheduleChange[];
  undo: ScheduleChange[];
};

type LayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LinkDraft = {
  fromId: string;
  x: number;
  y: number;
};

type DragState = {
  taskId: string;
  mode: "move" | "resize-start" | "resize-end";
  originX: number;
  start: Date;
  end: Date;
};

type BoardGanttViewProps = {
  boardId: string;
  boardName: string;
  columns: BoardColumnWithNodes[];
  childBoards: Record<string, NodeChildBoard>;
  dependencies: GanttDependency[];
  scheduleSavingIds: Set<string>;
  onCreateDependency: (input: {
    fromId: string;
    toId: string;
    type: GanttDependency["type"];
    lag?: number;
    mode?: GanttDependency["mode"];
    hardConstraint?: boolean;
  }) => void;
  onUpdateDependency: (id: string, patch: Partial<GanttDependency>) => void;
  onDeleteDependency: (id: string) => void;
  onCommitScheduleChanges: (changes: ScheduleChange[]) => void;
  onCreateTask: (input: {
    columnId: string;
    title: string;
    start?: Date | null;
    end?: Date | null;
  }) => void;
  onOpenTask: (id: string) => void;
  onOpenChildBoard?: (boardId: string) => void;
  defaultColumnId: string | null;
  loading?: boolean;
};


function normalizeDate(value: Date): Date {
  const result = new Date(value);
  result.setHours(12, 0, 0, 0);
  return result;
}

function parseMaybeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return normalizeDate(value);
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split("-").map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return normalizeDate(parsed);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalizeDate(parsed);
  }
  return null;
}

function addDays(date: Date, amount: number): Date {
  const base = normalizeDate(date);
  const result = new Date(base);
  result.setDate(base.getDate() + amount);
  return normalizeDate(result);
}

function differenceInDays(a: Date, b: Date): number {
  const first = normalizeDate(a).getTime();
  const second = normalizeDate(b).getTime();
  return Math.round((first - second) / MS_PER_DAY);
}

function ensureEndAfterStart(start: Date, end: Date): Date {
  if (end.getTime() < start.getTime()) {
    return new Date(start);
  }
  return end;
}

function isWeekend(date: Date): boolean {
  const day = normalizeDate(date).getDay();
  return day === 0 || day === 6;
}

function snapForwardToWorkingDay(date: Date): Date {
  let current = normalizeDate(date);
  while (isWeekend(current)) {
    current = addDays(current, 1);
  }
  return current;
}

function buildTask(
  node: BoardNode,
  column: BoardColumnWithNodes,
  childBoards: Record<string, NodeChildBoard>,
): InternalTask {
  const colorClass = BEHAVIOR_COLOR_CLASSES[column.behaviorKey] || "bg-slate-500";
  const plannedStart = parseMaybeDate(node.plannedStartDate ?? null);
  const plannedEnd = parseMaybeDate(node.plannedEndDate ?? null);
  const dueAt = parseMaybeDate(node.dueAt ?? null);
  const durationEstimate =
    typeof node.estimatedDurationDays === "number" && node.estimatedDurationDays > 0
      ? node.estimatedDurationDays
      : 1;

  let start = plannedStart ?? null;
  let end = plannedEnd ?? null;

  if (!start && end) {
    start = addDays(end, -Math.max(durationEstimate - 1, 0));
  }
  if (!start && dueAt) {
    start = addDays(dueAt, -Math.max(durationEstimate - 1, 0));
  }
  if (!end && dueAt) {
    end = dueAt;
  }
  if (!start) {
    start = normalizeDate(new Date());
  }
  if (!end) {
    end = addDays(start, Math.max(durationEstimate - 1, 0));
  }
  end = ensureEndAfterStart(start, end);
  const duration = Math.max(1, differenceInDays(end, start) + 1);

  return {
    id: node.id,
    title: node.title,
    columnId: column.id,
    columnName: column.name,
    columnBehavior: column.behaviorKey,
    colorClass,
    start,
    end,
    dueAt: end,
    duration,
    progress:
      typeof node.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(node.progress)))
        : null,
    hasChildBoard: Boolean(childBoards[node.id]),
    parentId: node.parentId,
    scheduleMode: node.scheduleMode ?? null,
    hardConstraint: Boolean(node.hardConstraint),
  };
}

function computeConstraint(
  predecessor: InternalTask,
  successor: InternalTask,
  dependency: GanttDependency,
): Date {
  const lag = dependency.lag ?? 0;
  const successorDuration = Math.max(1, successor.duration);
  switch (dependency.type) {
    case "SS": {
      const candidate = addDays(predecessor.start, lag);
      return snapForwardToWorkingDay(candidate);
    }
    case "FF": {
      const earliestFinish = snapForwardToWorkingDay(addDays(predecessor.end, lag));
      const start = addDays(earliestFinish, -successorDuration + 1);
      return snapForwardToWorkingDay(start);
    }
    case "SF": {
      const earliestFinishFromStart = snapForwardToWorkingDay(addDays(predecessor.start, lag));
      const start = addDays(earliestFinishFromStart, -successorDuration + 1);
      return snapForwardToWorkingDay(start);
    }
    case "FS":
    default: {
      const candidate = addDays(predecessor.end, lag);
      return snapForwardToWorkingDay(candidate);
    }
  }
}

function runAsapScheduling(
  tasks: Map<string, InternalTask>,
  dependencies: GanttDependency[],
) {
  const asapLinks = dependencies.filter((dep) => dep.mode === "ASAP" && !dep.hardConstraint);
  if (asapLinks.length === 0) {
    return {
      redo: [] as ScheduleChange[],
      undo: [] as ScheduleChange[],
      hasCycle: false,
    };
  }

  const clone = new Map<string, InternalTask>();
  tasks.forEach((task, id) => {
    clone.set(id, {
      ...task,
      start: new Date(task.start),
      end: new Date(task.end),
      dueAt: task.dueAt ? new Date(task.dueAt) : null,
    });
  });

  const incoming = new Map<string, GanttDependency[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  clone.forEach((_task, id) => {
    indegree.set(id, 0);
  });

  for (const dep of asapLinks) {
    if (!clone.has(dep.fromId) || !clone.has(dep.toId)) continue;
    if (!incoming.has(dep.toId)) incoming.set(dep.toId, []);
    incoming.get(dep.toId)!.push(dep);
    if (!outgoing.has(dep.fromId)) outgoing.set(dep.fromId, []);
    outgoing.get(dep.fromId)!.push(dep.toId);
    indegree.set(dep.toId, (indegree.get(dep.toId) ?? 0) + 1);
  }

  const queue: string[] = [];
  indegree.forEach((value, key) => {
    if (value === 0) queue.push(key);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    order.push(nodeId);
    for (const next of outgoing.get(nodeId) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }

  if (order.length < clone.size) {
    return {
      redo: [] as ScheduleChange[],
      undo: [] as ScheduleChange[],
      hasCycle: true,
    };
  }

  const redo: ScheduleChange[] = [];
  const undo: ScheduleChange[] = [];

  for (const taskId of order) {
    const links = incoming.get(taskId);
    if (!links || links.length === 0) continue;
    const task = clone.get(taskId);
    if (!task) continue;
    let proposedStart = task.start;
    for (const dep of links) {
      const predecessor = clone.get(dep.fromId);
      if (!predecessor) continue;
      const constraint = computeConstraint(predecessor, task, dep);
      if (constraint.getTime() > proposedStart.getTime()) {
        proposedStart = constraint;
      }
    }
    proposedStart = snapForwardToWorkingDay(proposedStart);
    if (proposedStart.getTime() !== task.start.getTime()) {
      const prevStart = task.start;
      const prevEnd = task.end;
      const newEnd = ensureEndAfterStart(proposedStart, addDays(proposedStart, task.duration - 1));
      task.start = proposedStart;
      task.end = newEnd;
      task.dueAt = newEnd;
      undo.push({ id: taskId, start: prevStart, end: prevEnd, dueAt: prevEnd });
      redo.push({ id: taskId, start: proposedStart, end: newEnd, dueAt: newEnd });
    }
  }

  return {
    redo,
    undo,
    hasCycle: false,
  };
}


export const BoardGanttView: React.FC<BoardGanttViewProps> = ({
  boardId,
  boardName,
  columns,
  childBoards,
  dependencies,
  scheduleSavingIds,
  onCreateDependency,
  onUpdateDependency,
  onDeleteDependency,
  onCommitScheduleChanges,
  onCreateTask,
  onOpenTask,
  onOpenChildBoard,
  defaultColumnId,
  loading = false,
}) => {
  const { t: tBoard, locale } = useTranslation("board");
  const [zoom, setZoom] = useState<ZoomLevel>("week");
  const dayWidth = ZOOM_DAY_WIDTH[zoom];
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const linkPointerActiveRef = useRef(false);

  const initialTasks = useMemo(() => {
    const tasks: InternalTask[] = [];
    for (const column of columns) {
      for (const node of column.nodes ?? []) {
        tasks.push(buildTask(node, column, childBoards));
      }
    }
    return tasks;
  }, [columns, childBoards]);

  const [taskMap, setTaskMap] = useState<Map<string, InternalTask>>(() => {
    const map = new Map<string, InternalTask>();
    for (const task of initialTasks) {
      map.set(task.id, task);
    }
    return map;
  });

  useEffect(() => {
    setTaskMap((prev) => {
      const next = new Map<string, InternalTask>();
      for (const task of initialTasks) {
        const existing = prev.get(task.id);
        if (existing) {
          next.set(task.id, {
            ...existing,
            columnId: task.columnId,
            columnName: task.columnName,
            columnBehavior: task.columnBehavior,
            colorClass: task.colorClass,
            hasChildBoard: task.hasChildBoard,
            scheduleMode: task.scheduleMode,
            hardConstraint: task.hardConstraint,
          });
        } else {
          next.set(task.id, task);
        }
      }
      return next;
    });
  }, [initialTasks]);

  const taskMapRef = useRef(taskMap);
  useEffect(() => {
    taskMapRef.current = taskMap;
  }, [taskMap]);

  const hoverTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    hoverTaskIdRef.current = hoverTaskId;
  }, [hoverTaskId]);

  const taskArray = useMemo(() => Array.from(taskMap.values()), [taskMap]);

  const range = useMemo(() => {
    if (taskArray.length === 0) {
      const today = normalizeDate(new Date());
      return {
        start: addDays(today, -5),
        end: addDays(today, 25),
      };
    }
    let minStart = taskArray[0].start;
    let maxEnd = taskArray[0].end;
    for (const task of taskArray) {
      if (task.start.getTime() < minStart.getTime()) minStart = task.start;
      if (task.end.getTime() > maxEnd.getTime()) maxEnd = task.end;
    }
    return {
      start: addDays(minStart, -3),
      end: addDays(maxEnd, 5),
    };
  }, [taskArray]);

  const totalDays = Math.max(1, differenceInDays(range.end, range.start) + 1);
  const today = normalizeDate(new Date());
  const todayIndex = Math.min(Math.max(0, differenceInDays(today, range.start)), totalDays);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  }), [locale]);
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
  }), [locale]);

  const days = useMemo(() => {
    const result: Date[] = [];
    for (let i = 0; i < totalDays; i += 1) {
      result.push(addDays(range.start, i));
    }
    return result;
  }, [range.start, totalDays]);

  const months = useMemo(() => {
    const groups: { key: string; label: string; span: number }[] = [];
    let currentKey: string | null = null;
    let span = 0;
    for (const day of days) {
      const label = monthFormatter.format(day);
      if (label === currentKey) {
        span += 1;
      } else {
        if (currentKey) {
          groups.push({ key: currentKey, label: currentKey, span });
        }
        currentKey = label;
        span = 1;
      }
    }
    if (currentKey) {
      groups.push({ key: currentKey, label: currentKey, span });
    }
    return groups;
  }, [days, monthFormatter]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, InternalTask[]>();
    for (const column of columns) {
      map.set(column.id, []);
    }
    for (const task of taskArray) {
      const bucket = map.get(task.columnId);
      if (bucket) {
        bucket.push(task);
      }
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.start.getTime() - b.start.getTime());
    }
    return map;
  }, [columns, taskArray]);

  const layout = useMemo(() => {
    const map = new Map<string, LayoutBox>();
    for (let laneIndex = 0; laneIndex < columns.length; laneIndex += 1) {
      const column = columns[laneIndex];
      const tasks = tasksByColumn.get(column.id) ?? [];
      for (const task of tasks) {
        const offsetStart = differenceInDays(task.start, range.start);
        const duration = Math.max(1, differenceInDays(task.end, task.start) + 1);
        const x = offsetStart * dayWidth;
        const width = Math.max(MIN_BAR_WIDTH, duration * dayWidth);
        const y = laneIndex * LANE_HEIGHT;
        map.set(task.id, { x, width, y, height: LANE_HEIGHT });
      }
    }
    return map;
  }, [columns, tasksByColumn, range.start, dayWidth]);

  const applyChanges = useCallback((changes: ScheduleChange[]) => {
    if (!changes.length) return;
    setTaskMap((prev) => {
      const next = new Map(prev);
      for (const change of changes) {
        const task = next.get(change.id);
        if (!task) continue;
        const nextStart = change.start ? normalizeDate(change.start) : task.start;
        let nextEnd = change.end ? normalizeDate(change.end) : task.end;
        nextEnd = ensureEndAfterStart(nextStart, nextEnd);
        const duration = Math.max(1, differenceInDays(nextEnd, nextStart) + 1);
        next.set(change.id, {
          ...task,
          start: nextStart,
          end: nextEnd,
          dueAt: change.dueAt ? normalizeDate(change.dueAt) : nextEnd,
          duration,
        });
      }
      return next;
    });
    onCommitScheduleChanges(changes);
  }, [onCommitScheduleChanges]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const entry = next.pop()!;
      applyChanges(entry.undo);
      setRedoStack((redoPrev) => [...redoPrev, entry]);
      return next;
    });
  }, [applyChanges]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const entry = next.pop()!;
      applyChanges(entry.redo);
      setUndoStack((undoPrev) => [...undoPrev, entry]);
      return next;
    });
  }, [applyChanges]);

  const handleScrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const offset = Math.max(0, todayIndex * dayWidth - scrollRef.current.clientWidth / 2);
    scrollRef.current.scrollTo({ left: offset, behavior: "smooth" });
  }, [dayWidth, todayIndex]);

  const handleLinkPointerMove = useCallback((event: PointerEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLinkDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    });
  }, []);

  const handleLinkPointerUp = useCallback(() => {
    window.removeEventListener("pointermove", handleLinkPointerMove);
    linkPointerActiveRef.current = false;
    setLinkDraft((prev) => {
      if (!prev) return null;
      const targetId = hoverTaskIdRef.current;
      if (targetId && targetId !== prev.fromId) {
        onCreateDependency({
          fromId: prev.fromId,
          toId: targetId,
          type: "FS",
          lag: 0,
          mode: "ASAP",
        });
      }
      return null;
    });
    setHoverTaskId(null);
  }, [handleLinkPointerMove, onCreateDependency]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleLinkPointerMove);
    };
  }, [handleLinkPointerMove]);

  const handleTaskPointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const deltaPx = event.clientX - state.originX;
    const deltaDays = Math.round(deltaPx / dayWidth);
    if (deltaDays === 0) return;
    setTaskMap((prev) => {
      const next = new Map(prev);
      const task = next.get(state.taskId);
      if (!task) return prev;
      if (state.mode === "move") {
        const nextStart = addDays(state.start, deltaDays);
        const nextEnd = addDays(state.end, deltaDays);
        next.set(task.id, {
          ...task,
          start: nextStart,
          end: nextEnd,
          dueAt: nextEnd,
          duration: Math.max(1, differenceInDays(nextEnd, nextStart) + 1),
        });
      } else if (state.mode === "resize-start") {
        let nextStart = addDays(state.start, deltaDays);
        if (nextStart.getTime() > state.end.getTime()) {
          nextStart = new Date(state.end);
        }
        const nextEnd = ensureEndAfterStart(nextStart, task.end);
        next.set(task.id, {
          ...task,
          start: nextStart,
          end: nextEnd,
          dueAt: nextEnd,
          duration: Math.max(1, differenceInDays(nextEnd, nextStart) + 1),
        });
      } else {
        let nextEnd = addDays(state.end, deltaDays);
        if (nextEnd.getTime() < state.start.getTime()) {
          nextEnd = new Date(state.start);
        }
        nextEnd = ensureEndAfterStart(task.start, nextEnd);
        next.set(task.id, {
          ...task,
          end: nextEnd,
          dueAt: nextEnd,
          duration: Math.max(1, differenceInDays(nextEnd, task.start) + 1),
        });
      }
      return next;
    });
  }, [dayWidth]);

  const handleTaskPointerUp = useCallback(() => {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    window.removeEventListener("pointermove", handleTaskPointerMove);
    if (!state) return;
    const task = taskMapRef.current.get(state.taskId);
    if (!task) return;
    const hasChanged =
      task.start.getTime() !== state.start.getTime() ||
      task.end.getTime() !== state.end.getTime();
    if (!hasChanged) return;
    const redoChange: ScheduleChange = {
      id: task.id,
      start: task.start,
      end: task.end,
      dueAt: task.end,
    };
    const undoChange: ScheduleChange = {
      id: task.id,
      start: state.start,
      end: state.end,
      dueAt: state.end,
    };
    applyChanges([redoChange]);
    setUndoStack((prev) => [...prev, { redo: [redoChange], undo: [undoChange] }]);
    setRedoStack([]);
  }, [applyChanges, handleTaskPointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleTaskPointerMove);
      window.removeEventListener("pointerup", handleTaskPointerUp);
    };
  }, [handleTaskPointerMove, handleTaskPointerUp]);

  const handleTaskPointerDown = useCallback(
    (taskId: string, mode: DragState["mode"]) => (event: React.PointerEvent<HTMLDivElement>) => {
      event.stopPropagation();
      event.preventDefault();
      const task = taskMapRef.current.get(taskId);
      if (!task) return;
      dragStateRef.current = {
        taskId,
        mode,
        originX: event.clientX,
        start: task.start,
        end: task.end,
      };
      window.addEventListener("pointermove", handleTaskPointerMove);
      window.addEventListener("pointerup", handleTaskPointerUp, { once: true });
    },
    [handleTaskPointerMove, handleTaskPointerUp],
  );

  const handleTaskMouseEnter = useCallback((id: string) => () => {
    setHoverTaskId(id);
  }, []);

  const handleTaskMouseLeave = useCallback(() => {
    if (!linkPointerActiveRef.current) {
      setHoverTaskId(null);
    }
  }, []);

  const handleStartLink = useCallback(
    (taskId: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      linkPointerActiveRef.current = true;
      setLinkDraft({
        fromId: taskId,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      window.addEventListener("pointermove", handleLinkPointerMove);
      window.addEventListener("pointerup", handleLinkPointerUp, { once: true });
    },
    [handleLinkPointerMove, handleLinkPointerUp],
  );

  const [activeLinkMenu, setActiveLinkMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!activeLinkMenu) return;
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-link-menu]") || target.closest("[data-link-label]")) return;
      setActiveLinkMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [activeLinkMenu]);

  const handleAlignDependency = useCallback(() => {
      const result = runAsapScheduling(taskMapRef.current, dependencies);
      if (result.hasCycle) {
        setScheduleWarning(tBoard("gantt.links.cycleWarning"));
        return;
      }
      if (!result.redo.length) {
        setScheduleWarning(tBoard("gantt.links.noChange"));
        return;
      }
      setScheduleWarning(null);
      applyChanges(result.redo);
      setUndoStack((prev) => [...prev, { redo: result.redo, undo: result.undo }]);
      setRedoStack([]);
    },
    [applyChanges, dependencies, tBoard],
  );

  const handleLaneDoubleClick = useCallback(
    (columnId: string) => (event: React.MouseEvent<HTMLDivElement>) => {
      if (!defaultColumnId && !columnId) return;
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dayIndex = Math.max(0, Math.floor((event.clientX - rect.left) / dayWidth));
      const start = addDays(range.start, dayIndex);
      const end = addDays(start, 0);
      const title = window.prompt(tBoard("gantt.prompts.newTask"));
      if (!title || !title.trim()) return;
      onCreateTask({
        columnId: columnId || defaultColumnId!,
        title: title.trim(),
        start,
        end,
      });
    },
    [dayWidth, range.start, defaultColumnId, onCreateTask, tBoard],
  );

  const activeDependency = useMemo(() => {
    if (!activeLinkMenu) return null;
    return dependencies.find((dep) => dep.id === activeLinkMenu.id) ?? null;
  }, [activeLinkMenu, dependencies]);

  const markerAsapId = useMemo(() => `${boardId}-asap-marker`, [boardId]);
  const markerFreeId = useMemo(() => `${boardId}-free-marker`, [boardId]);

  const renderDependencyMenu = () => {
    if (!activeLinkMenu || !activeDependency) return null;
    return (
      <div
        className="absolute z-50 rounded-xl border border-white/10 bg-surface/95 p-3 text-xs shadow-2xl"
        style={{ left: activeLinkMenu.x, top: activeLinkMenu.y }}
        data-link-menu
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <span>{activeDependency.type}</span>
            {activeDependency.mode === "ASAP" ? (
              <span className="inline-flex items-center gap-1 text-accent"><Zap size={14} />{tBoard("gantt.links.modeAsap")}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted"><Circle size={12} />{tBoard("gantt.links.modeFree")}</span>
            )}
          </div>
          <button
            type="button"
            className="rounded-full border border-white/15 p-1 text-muted hover:border-rose-300 hover:text-rose-200"
            onClick={() => {
              onDeleteDependency(activeDependency.id);
              setActiveLinkMenu(null);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className="mt-3 space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-left text-xs hover:border-accent hover:text-foreground"
            onClick={() =>
              onUpdateDependency(activeDependency.id, {
                mode: activeDependency.mode === "ASAP" ? "FREE" : "ASAP",
              })
            }
          >
            <span>{tBoard("gantt.links.toggleMode")}</span>
            {activeDependency.mode === "ASAP" ? <Circle size={12} /> : <Zap size={14} />}
          </button>
          <div className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-xs">
            <span>{tBoard("gantt.links.lag")}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-white/15 p-1 hover:border-accent"
                onClick={() =>
                  onUpdateDependency(activeDependency.id, {
                    lag: activeDependency.lag - 1,
                  })
                }
              >
                <Minus size={12} />
              </button>
              <span className="min-w-[2ch] text-center font-semibold">{activeDependency.lag}</span>
              <button
                type="button"
                className="rounded-full border border-white/15 p-1 hover:border-accent"
                onClick={() =>
                  onUpdateDependency(activeDependency.id, {
                    lag: activeDependency.lag + 1,
                  })
                }
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["FS", "SS", "FF", "SF"] as GanttDependency["type"][]).map((type) => (
              <button
                key={type}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  activeDependency.type === type
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-white/15 text-muted hover:border-accent hover:text-foreground"
                }`}
                onClick={() => onUpdateDependency(activeDependency.id, { type })}
              >
                {type}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:border-accent hover:text-foreground"
            onClick={() =>
              onUpdateDependency(activeDependency.id, {
                hardConstraint: !activeDependency.hardConstraint,
              })
            }
          >
            <span>{tBoard("gantt.links.hardConstraint")}</span>
            {activeDependency.hardConstraint ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/20 px-3 py-1.5 text-xs font-semibold text-accent hover:border-accent hover:bg-accent/30"
            onClick={() => {
              handleAlignDependency();
              setActiveLinkMenu(null);
            }}
          >
            <Zap size={14} />
            {tBoard("gantt.links.align")}
          </button>
        </div>
      </div>
    );
  };

  const renderTaskBar = (task: InternalTask) => {
    const box = layout.get(task.id);
    if (!box) return null;
    const isSaving = scheduleSavingIds.has(task.id);
    const isMilestone = task.duration === 1;
    const childBoard = childBoards[task.id];
    return (
      <div
        key={task.id}
        className="absolute"
        style={{ left: box.x, width: box.width, top: box.y + 6 }}
        onMouseEnter={handleTaskMouseEnter(task.id)}
        onMouseLeave={handleTaskMouseLeave}
        data-task-id={task.id}
      >
        <div
          className={`group relative flex h-9 items-center overflow-hidden rounded-lg border border-white/15 px-3 text-xs text-foreground shadow transition ${task.colorClass}`}
          onDoubleClick={() => onOpenTask(task.id)}
          onPointerDown={handleTaskPointerDown(task.id, "move")}
        >
          {task.progress != null && (
            <div
              className="absolute inset-0 bg-black/20"
              style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }}
            />
          )}
          <div className="relative z-10 flex w-full items-center gap-2">
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{task.title}</p>
              <p className="text-[10px] text-white/70">
                {tBoard("gantt.taskRange", {
                  start: dayFormatter.format(task.start),
                  end: dayFormatter.format(task.end),
                })}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {childBoard && onOpenChildBoard && (
                <button
                  type="button"
                  className="rounded-full border border-white/15 p-1 text-muted hover:border-accent hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenChildBoard(childBoard.boardId);
                  }}
                >
                  <Layers size={14} />
                </button>
              )}
              <button
                type="button"
                className="rounded-full border border-white/15 p-1 text-muted hover:border-accent hover:text-foreground"
                onPointerDown={handleStartLink(task.id)}
              >
                <Link2 size={14} />
              </button>
            </div>
          </div>
          <div
            className="absolute left-0 top-0 h-full w-1 cursor-ew-resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              handleTaskPointerDown(task.id, "resize-start")(event);
            }}
          />
          <div
            className="absolute right-0 top-0 h-full w-1 cursor-ew-resize"
            onPointerDown={(event) => {
              event.stopPropagation();
              handleTaskPointerDown(task.id, "resize-end")(event);
            }}
          />
          {isMilestone && (
            <div className="absolute inset-y-2 right-3 w-2 rotate-45 rounded-sm bg-white/60" />
          )}
          {isSaving && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-card/80">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{boardName}</h3>
          <p className="text-xs text-muted">{tBoard("gantt.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-surface/60 p-0.5">
            {(["day", "week", "month"] as ZoomLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                className={`rounded-full px-3 py-1 font-semibold transition ${
                  zoom === level
                    ? "bg-accent text-background shadow"
                    : "text-muted hover:text-foreground"
                }`}
                onClick={() => setZoom(level)}
              >
                {tBoard(`gantt.zoom.${level}` as const)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 transition hover:border-accent hover:text-foreground"
            onClick={handleScrollToToday}
          >
            <CalendarClock size={14} />
            {tBoard("gantt.toolbar.today")}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 transition hover:border-accent hover:text-foreground disabled:opacity-40"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
          >
            <Undo2 size={14} />
            {tBoard("gantt.toolbar.undo")}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 transition hover:border-accent hover:text-foreground disabled:opacity-40"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
          >
            <Redo2 size={14} />
            {tBoard("gantt.toolbar.redo")}
          </button>
        </div>
      </div>
      {scheduleWarning && (
        <div className="border-b border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          {scheduleWarning}
        </div>
      )}
      <div className="flex border-b border-white/10 bg-surface/60">
        <div className="w-56 shrink-0 border-r border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">
          {tBoard("gantt.columns")}
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="sticky top-0 z-20 border-b border-white/10 bg-surface/80 backdrop-blur">
            <div className="flex" style={{ width: totalDays * dayWidth }}>
              {months.map((segment) => (
                <div
                  key={`${segment.key}-${segment.span}`}
                  className="border-r border-white/10 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
                  style={{ width: segment.span * dayWidth }}
                >
                  {segment.label}
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ width: totalDays * dayWidth }}>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`border-r border-white/10 px-2 py-1 text-[10px] ${isWeekend(day) ? "bg-white/5 text-muted" : "text-muted"}`}
                  style={{ width: dayWidth }}
                >
                  {dayFormatter.format(day)}
                </div>
              ))}
              <div
                className="absolute top-0 bottom-0 w-px bg-accent/60"
                style={{ left: todayIndex * dayWidth }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex" style={{ minHeight: Math.max(columns.length * LANE_HEIGHT, 240) }}>
        <div className="w-56 shrink-0 border-r border-white/10">
          {columns.map((column) => (
            <div
              key={column.id}
              className="flex h-[60px] items-center justify-between px-4 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{column.name}</p>
                <p className="text-xs text-muted uppercase">{tBoard(`behaviors.${column.behaviorKey}` as const)}</p>
              </div>
              <span
                className={`inline-flex h-2 w-2 rounded-full ${BEHAVIOR_COLOR_CLASSES[column.behaviorKey] || "bg-slate-500"}`}
              />
            </div>
          ))}
        </div>
        <div className="relative flex-1 overflow-auto" ref={scrollRef}>
          <div
            ref={timelineRef}
            className="relative"
            style={{ width: totalDays * dayWidth, minHeight: columns.length * LANE_HEIGHT }}
          >
            {days.map((day, index) => (
              <div
                key={`grid-${day.toISOString()}`}
                className={`absolute top-0 bottom-0 border-r border-white/5 ${isWeekend(day) ? "bg-white/5" : ""}`}
                style={{ left: index * dayWidth, width: dayWidth }}
              />
            ))}
            <div
              className="absolute top-0 bottom-0 w-px bg-accent/60"
              style={{ left: todayIndex * dayWidth }}
            />
            {columns.map((column) => (
              <div
                key={`lane-${column.id}`}
                className="relative border-b border-white/10"
                style={{ height: LANE_HEIGHT }}
                onDoubleClick={handleLaneDoubleClick(column.id)}
              >
                {(tasksByColumn.get(column.id) ?? []).map(renderTaskBar)}
              </div>
            ))}
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={totalDays * dayWidth}
              height={columns.length * LANE_HEIGHT}
            >
              <defs>
                <marker id={markerAsapId} markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#38bdf8" />
                </marker>
                <marker id={markerFreeId} markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="rgba(255,255,255,0.45)" />
                </marker>
              </defs>
              {dependencies.map((dep) => {
                const source = layout.get(dep.fromId);
                const target = layout.get(dep.toId);
                if (!source || !target) return null;
                const sourceX = dep.type === "SS" || dep.type === "SF" ? source.x : source.x + source.width;
                const targetX = dep.type === "FF" || dep.type === "SF" ? target.x + target.width : target.x;
                const sourceY = source.y + LANE_HEIGHT / 2;
                const targetY = target.y + LANE_HEIGHT / 2;
                const midX = sourceX + (targetX - sourceX) / 2;
                const stroke = dep.mode === "ASAP" ? "#38bdf8" : "rgba(255,255,255,0.45)";
                const path = `M${sourceX} ${sourceY} C ${midX} ${sourceY}, ${midX} ${targetY}, ${targetX} ${targetY}`;
                return (
                  <g key={dep.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={1.5}
                      strokeDasharray={dep.mode === "FREE" ? "4 4" : undefined}
                      markerEnd={`url(#${dep.mode === "ASAP" ? markerAsapId : markerFreeId})`}
                    />
                    <foreignObject
                      x={Math.min(sourceX, targetX) + Math.abs(targetX - sourceX) / 2 - 24}
                      y={(sourceY + targetY) / 2 - 12}
                      width={48}
                      height={24}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-center gap-1 rounded-full border border-white/10 bg-surface/80 px-1.5 py-1 text-[10px] font-semibold text-foreground hover:border-accent"
                        onClick={() => setActiveLinkMenu({ id: dep.id, x: Math.min(sourceX, targetX) + Math.abs(targetX - sourceX) / 2 - 24, y: (sourceY + targetY) / 2 })}
                        data-link-label
                      >
                        <span>{dep.type}</span>
                        {dep.mode === "ASAP" ? <Zap size={12} /> : <Circle size={10} />}
                      </button>
                    </foreignObject>
                  </g>
                );
              })}
              {linkDraft && (
                (() => {
                  const source = layout.get(linkDraft.fromId);
                  if (!source) return null;
                  const startX = source.x + source.width;
                  const startY = source.y + LANE_HEIGHT / 2;
                  const midX = startX + (linkDraft.x - startX) / 2;
                  const path = `M${startX} ${startY} C ${midX} ${startY}, ${midX} ${linkDraft.y}, ${linkDraft.x} ${linkDraft.y}`;
                  return (
                    <path
                      key="draft"
                      d={path}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  );
                })()
              )}
            </svg>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/60 text-sm text-muted">
                {tBoard("gantt.loading")}
              </div>
            )}
            {renderDependencyMenu()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BoardGanttView;
