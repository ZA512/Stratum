"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import {
  ensureChildBoard,
  fetchBoardDetail,
  fetchChildBoards,
  fetchNodeBreadcrumb,
  fetchRootBoard,
  type Board,
  type BoardNode,
  type ColumnBehaviorKey,
  type NodeBreadcrumbItem,
  type NodeChildBoard,
} from "@/features/boards/boards-api";
import { fetchNodeCollaborators } from "@/features/nodes/node-collaborators-api";
import { createNode, moveChildNode, updateNode } from "@/features/nodes/nodes-api";
import { type ActivityLog, fetchNodeActivity } from "@/features/activity/activity-api";
import { formatActivityMessage } from "@/features/activity/activity-formatter";

type ListScope = "CURRENT" | "SUBTREE" | "ROOT";
type ListRenderMode = "TREE" | "FLAT";
type SortField = "deadline" | "priority" | "updatedAt" | "status" | "assignee" | "title";
type SortDirection = "asc" | "desc";
type UpdatedWithinDays = 1 | 3 | 7 | 14 | 30 | null;
type PriorityValue = NonNullable<BoardNode["priority"]>;
type EffortValue = NonNullable<BoardNode["effort"]>;
type BoolFilter = "ANY" | "YES" | "NO";
type ListColumnKey =
  | "title"
  | "status"
  | "priority"
  | "progress"
  | "effort"
  | "assignee"
  | "deadline"
  | "updatedAt"
  | "counters"
  | "flags"
  | "path";

type AdvancedFilters = {
  title: string;
  description: string;
  id: string;
  assigneeIds: string[];
  priorities: PriorityValue[];
  behaviors: ColumnBehaviorKey[];
  statusColumnIds: string[];
  deadlineFrom: string;
  deadlineTo: string;
  updatedFrom: string;
  updatedTo: string;
  hasRecentComment: BoolFilter;
  hasChildren: BoolFilter;
};

export type BoardListFilters = {
  initialized: boolean;
  renderMode: ListRenderMode;
  scope: ListScope;
  positionBoardId: string | null;
  query: string;
  includeDone: boolean;
  contextMode: boolean;
  chips: {
    mine: boolean;
    overdue: boolean;
    today: boolean;
    week: boolean;
    blocked: boolean;
    updatedWithinDays: UpdatedWithinDays;
  };
  advanced: AdvancedFilters;
  sort: {
    field: SortField;
    direction: SortDirection;
  };
  visibleColumns: ListColumnKey[];
  activeViewId: string | null;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  title: "",
  description: "",
  id: "",
  assigneeIds: [],
  priorities: [],
  behaviors: [],
  statusColumnIds: [],
  deadlineFrom: "",
  deadlineTo: "",
  updatedFrom: "",
  updatedTo: "",
  hasRecentComment: "ANY",
  hasChildren: "ANY",
};

const TREE_COLUMNS_DEFAULT: ListColumnKey[] = [
  "title",
  "status",
  "priority",
  "progress",
  "effort",
  "assignee",
  "deadline",
  "updatedAt",
  "counters",
  "flags",
];

const FLAT_COLUMNS_DEFAULT: ListColumnKey[] = [
  "title",
  "status",
  "priority",
  "progress",
  "effort",
  "assignee",
  "deadline",
  "updatedAt",
  "counters",
  "flags",
  "path",
];

export const DEFAULT_LIST_FILTERS: BoardListFilters = {
  initialized: true,
  renderMode: "FLAT",
  scope: "SUBTREE",
  positionBoardId: null,
  query: "",
  includeDone: false,
  contextMode: true,
  chips: {
    mine: false,
    overdue: false,
    today: false,
    week: true,
    blocked: false,
    updatedWithinDays: null,
  },
  advanced: DEFAULT_ADVANCED_FILTERS,
  sort: {
    field: "priority",
    direction: "asc",
  },
  visibleColumns: FLAT_COLUMNS_DEFAULT,
  activeViewId: "official:this-week",
};

type BoardHierarchyEntry = {
  board: Board;
  breadcrumb: NodeBreadcrumbItem[];
  childBoards: NodeChildBoard[];
};

type ListRow = {
  id: string;
  shortId: number | null;
  title: string;
  description: string | null;
  boardId: string;
  boardName: string;
  boardNodeId: string;
  parentId: string | null;
  position: number;
  columnId: string;
  columnName: string;
  columnBehavior: ColumnBehaviorKey;
  assigneeIds: string[];
  assignees: string[];
  priority: PriorityValue;
  progress: number | null;
  effort: EffortValue | null;
  dueAt: string | null;
  updatedAt: string | null;
  pathLabel: string;
  childBoardId: string | null;
  hasChildren: boolean;
  hasRecentComment: boolean;
  blockedSince: string | null;
  sharedPlacementLocked: boolean;
  counts: {
    backlog: number;
    inProgress: number;
    blocked: number;
    done: number;
  };
};

type PersonalView = {
  id: string;
  name: string;
  config: BoardListFilters;
};

type OfficialView = {
  id: string;
  name: string;
  config: Partial<BoardListFilters>;
};

type BoardOption = {
  boardId: string;
  label: string;
  path: string;
};

type BoardListViewProps = {
  rootBoard: Board;
  filters: BoardListFilters;
  onFiltersChange: (next: BoardListFilters) => void;
  onOpenTask: (id: string) => void;
  onOpenBoard: (boardId: string) => void;
  onDataMutated?: () => Promise<void> | void;
};

const PRIORITY_WEIGHT: Record<PriorityValue, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  LOWEST: 4,
  NONE: 5,
};

const OFFICIAL_VIEWS: OfficialView[] = [
  {
    id: "overdue",
    name: "En retard",
    config: {
      renderMode: "FLAT",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: false,
      chips: {
        mine: false,
        overdue: true,
        today: false,
        week: false,
        blocked: false,
        updatedWithinDays: null,
      },
      sort: { field: "deadline", direction: "asc" },
      visibleColumns: FLAT_COLUMNS_DEFAULT,
    },
  },
  {
    id: "today",
    name: "A faire aujourd'hui",
    config: {
      renderMode: "FLAT",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: false,
      chips: {
        mine: false,
        overdue: false,
        today: true,
        week: false,
        blocked: false,
        updatedWithinDays: null,
      },
      sort: { field: "priority", direction: "asc" },
      visibleColumns: FLAT_COLUMNS_DEFAULT,
    },
  },
  {
    id: "this-week",
    name: "Cette semaine",
    config: {
      renderMode: "FLAT",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: false,
      chips: {
        mine: false,
        overdue: false,
        today: false,
        week: true,
        blocked: false,
        updatedWithinDays: null,
      },
      sort: { field: "priority", direction: "asc" },
      visibleColumns: FLAT_COLUMNS_DEFAULT,
    },
  },
  {
    id: "blocked",
    name: "Bloquees",
    config: {
      renderMode: "TREE",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: true,
      chips: {
        mine: false,
        overdue: false,
        today: false,
        week: false,
        blocked: true,
        updatedWithinDays: null,
      },
      sort: { field: "title", direction: "asc" },
      visibleColumns: TREE_COLUMNS_DEFAULT,
    },
  },
  {
    id: "updated-7",
    name: "Dernieres mises a jour (7j)",
    config: {
      renderMode: "FLAT",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: false,
      chips: {
        mine: false,
        overdue: false,
        today: false,
        week: false,
        blocked: false,
        updatedWithinDays: 7,
      },
      sort: { field: "updatedAt", direction: "desc" },
      visibleColumns: FLAT_COLUMNS_DEFAULT,
    },
  },
  {
    id: "mine",
    name: "Mes taches",
    config: {
      renderMode: "FLAT",
      scope: "SUBTREE",
      includeDone: false,
      contextMode: false,
      chips: {
        mine: true,
        overdue: false,
        today: false,
        week: false,
        blocked: false,
        updatedWithinDays: null,
      },
      sort: { field: "deadline", direction: "asc" },
      visibleColumns: FLAT_COLUMNS_DEFAULT,
    },
  },
];

const SORT_FIELDS: Array<{ id: SortField; label: string }> = [
  { id: "deadline", label: "Deadline" },
  { id: "priority", label: "Priorite" },
  { id: "updatedAt", label: "Derniere activite" },
  { id: "status", label: "Statut" },
  { id: "assignee", label: "Assignee" },
  { id: "title", label: "Titre" },
];

const SCOPE_OPTIONS: Array<{ value: ListScope; label: string; helper: string }> = [
  {
    value: "CURRENT",
    label: "Niveau de la position",
    helper: "Affiche uniquement les cartes du kanban selectionne",
  },
  {
    value: "SUBTREE",
    label: "Position + descendants",
    helper: "Affiche le sous-arbre complet a partir de la position",
  },
  {
    value: "ROOT",
    label: "Projet complet",
    helper: "Affiche toutes les cartes du projet racine",
  },
];

const COLUMN_LABELS: Record<ListColumnKey, string> = {
  title: "Titre",
  status: "Statut",
  priority: "Priorite",
  progress: "Progression",
  effort: "Effort",
  assignee: "Assignee",
  deadline: "Deadline",
  updatedAt: "Derniere activite",
  counters: "b.e.bl.t",
  flags: "Indicateurs",
  path: "Chemin",
};

const sanitizeStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const isPriorityValue = (value: string): value is PriorityValue =>
  value === "CRITICAL" ||
  value === "HIGH" ||
  value === "MEDIUM" ||
  value === "LOW" ||
  value === "LOWEST" ||
  value === "NONE";

const isBehaviorValue = (value: string): value is ColumnBehaviorKey =>
  value === "BACKLOG" ||
  value === "IN_PROGRESS" ||
  value === "BLOCKED" ||
  value === "DONE" ||
  value === "CUSTOM";

const isSortField = (value: string): value is SortField =>
  value === "deadline" ||
  value === "priority" ||
  value === "updatedAt" ||
  value === "status" ||
  value === "assignee" ||
  value === "title";

const isSortDirection = (value: string): value is SortDirection => value === "asc" || value === "desc";
const isRenderMode = (value: string): value is ListRenderMode => value === "TREE" || value === "FLAT";
const isScope = (value: string): value is ListScope =>
  value === "CURRENT" || value === "SUBTREE" || value === "ROOT";

const normalizeDateValue = (value: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toStartOfDay = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate());

const getDueDiff = (dueAt: string | null): number | null => {
  if (!dueAt) return null;
  const dueDate = normalizeDateValue(dueAt);
  if (!dueDate) return null;
  const today = toStartOfDay(new Date());
  const dueStart = toStartOfDay(dueDate);
  return Math.round((dueStart.getTime() - today.getTime()) / DAY_IN_MS);
};

const getEndOfWeekDiff = (): number => {
  const today = toStartOfDay(new Date());
  const day = today.getDay();
  const diffToSunday = day === 0 ? 0 : 7 - day;
  return diffToSunday;
};

const normalizeFilters = (input: BoardListFilters, rootBoardId: string): BoardListFilters => {
  const renderMode = isRenderMode(input.renderMode) ? input.renderMode : DEFAULT_LIST_FILTERS.renderMode;
  const scope = isScope(input.scope) ? input.scope : DEFAULT_LIST_FILTERS.scope;
  const sortField = isSortField(input.sort?.field ?? "") ? input.sort.field : DEFAULT_LIST_FILTERS.sort.field;
  const sortDirection = isSortDirection(input.sort?.direction ?? "")
    ? input.sort.direction
    : DEFAULT_LIST_FILTERS.sort.direction;

  const updatedWithinDaysRaw = input.chips?.updatedWithinDays;
  const updatedWithinDays: UpdatedWithinDays =
    updatedWithinDaysRaw === 1 ||
    updatedWithinDaysRaw === 3 ||
    updatedWithinDaysRaw === 7 ||
    updatedWithinDaysRaw === 14 ||
    updatedWithinDaysRaw === 30
      ? updatedWithinDaysRaw
      : null;

  const advancedRaw = input.advanced ?? DEFAULT_ADVANCED_FILTERS;
  const advanced: AdvancedFilters = {
    ...DEFAULT_ADVANCED_FILTERS,
    ...advancedRaw,
    assigneeIds: sanitizeStrings(advancedRaw.assigneeIds),
    priorities: sanitizeStrings(advancedRaw.priorities).filter(isPriorityValue),
    behaviors: sanitizeStrings(advancedRaw.behaviors).filter(isBehaviorValue),
    statusColumnIds: sanitizeStrings(advancedRaw.statusColumnIds),
    hasRecentComment:
      advancedRaw.hasRecentComment === "YES" || advancedRaw.hasRecentComment === "NO"
        ? advancedRaw.hasRecentComment
        : "ANY",
    hasChildren:
      advancedRaw.hasChildren === "YES" || advancedRaw.hasChildren === "NO" ? advancedRaw.hasChildren : "ANY",
  };

  const visibleSource = sanitizeStrings(input.visibleColumns).filter(
    (key): key is ListColumnKey =>
      key === "title" ||
      key === "status" ||
      key === "priority" ||
      key === "progress" ||
      key === "effort" ||
      key === "assignee" ||
      key === "deadline" ||
      key === "updatedAt" ||
      key === "counters" ||
      key === "flags" ||
      key === "path",
  );

  const defaultVisible = renderMode === "FLAT" ? FLAT_COLUMNS_DEFAULT : TREE_COLUMNS_DEFAULT;
  const visibleColumns = visibleSource.length > 0 ? visibleSource : defaultVisible;

  const dedupedColumns: ListColumnKey[] = [];
  for (const key of visibleColumns) {
    if (!dedupedColumns.includes(key)) dedupedColumns.push(key);
  }

  if (!dedupedColumns.includes("title")) dedupedColumns.unshift("title");
  if (renderMode === "FLAT" && !dedupedColumns.includes("path")) dedupedColumns.push("path");

  return {
    initialized: Boolean(input.initialized),
    renderMode,
    scope,
    positionBoardId: input.positionBoardId ?? rootBoardId,
    query: typeof input.query === "string" ? input.query : "",
    includeDone: Boolean(input.includeDone),
    contextMode: input.contextMode !== false,
    chips: {
      mine: Boolean(input.chips?.mine),
      overdue: Boolean(input.chips?.overdue),
      today: Boolean(input.chips?.today),
      week: Boolean(input.chips?.week),
      blocked:
        advanced.behaviors.length > 0
          ? advanced.behaviors.includes("BLOCKED")
          : Boolean(input.chips?.blocked),
      updatedWithinDays,
    },
    advanced,
    sort: {
      field: sortField,
      direction: sortDirection,
    },
    visibleColumns: dedupedColumns,
    activeViewId: input.activeViewId ?? null,
  };
};

const normalizeCounts = (
  value: BoardNode["counts"] | undefined,
): { backlog: number; inProgress: number; blocked: number; done: number } => ({
  backlog: value?.backlog ?? 0,
  inProgress: value?.inProgress ?? 0,
  blocked: value?.blocked ?? 0,
  done: value?.done ?? 0,
});

const withRecomputedCounters = (rows: ListRow[]): ListRow[] => {
  const countsByParent = new Map<string, { backlog: number; inProgress: number; blocked: number; done: number }>();

  for (const row of rows) {
    if (!row.parentId) continue;
    let bucket = countsByParent.get(row.parentId);
    if (!bucket) {
      bucket = { backlog: 0, inProgress: 0, blocked: 0, done: 0 };
      countsByParent.set(row.parentId, bucket);
    }

    if (row.columnBehavior === "BACKLOG") bucket.backlog += 1;
    if (row.columnBehavior === "IN_PROGRESS") bucket.inProgress += 1;
    if (row.columnBehavior === "BLOCKED") bucket.blocked += 1;
    if (row.columnBehavior === "DONE") bucket.done += 1;
  }

  return rows.map((row) => {
    const recomputed = countsByParent.get(row.id);
    return recomputed ? { ...row, counts: recomputed } : row;
  });
};

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const parseQueryTokens = (raw: string): string[] =>
  raw.match(/[@#!]"[^"]*"|[@#!][^\s"]+|"[^"]+"|[^\s]+/g) ?? [];

const matchesDateRange = (value: string | null, from: string, to: string): boolean => {
  if (!value) return false;
  const parsed = normalizeDateValue(value);
  if (!parsed) return false;
  const point = toStartOfDay(parsed).getTime();

  if (from) {
    const fromDate = normalizeDateValue(`${from}T00:00:00.000Z`);
    if (fromDate && point < toStartOfDay(fromDate).getTime()) return false;
  }

  if (to) {
    const toDate = normalizeDateValue(`${to}T00:00:00.000Z`);
    if (toDate && point > toStartOfDay(toDate).getTime()) return false;
  }

  return true;
};

const boolFilterMatches = (filter: BoolFilter, value: boolean): boolean => {
  if (filter === "ANY") return true;
  if (filter === "YES") return value;
  return !value;
};

export function BoardListView({
  rootBoard,
  filters,
  onFiltersChange,
  onOpenTask,
  onOpenBoard,
  onDataMutated,
}: BoardListViewProps) {
  const { accessToken, user } = useAuth();
  const { t: tBoard, locale } = useTranslation("board");
  const { t: tActivity } = useTranslation("activity");

  const normalizedFilters = useMemo(() => normalizeFilters(filters, rootBoard.id), [filters, rootBoard.id]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hierarchy, setHierarchy] = useState<BoardHierarchyEntry[]>([]);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [dataRootBoardId, setDataRootBoardId] = useState<string | null>(null);
  const [positionEntry, setPositionEntry] = useState<BoardHierarchyEntry | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [savingRowIds, setSavingRowIds] = useState<string[]>([]);
  const [collaboratorsByNodeId, setCollaboratorsByNodeId] = useState<
    Map<string, Array<{ id: string; label: string }>>
  >(new Map());
  const [collaboratorsLoadingIds, setCollaboratorsLoadingIds] = useState<string[]>([]);
  const [activityByNodeId, setActivityByNodeId] = useState<Map<string, ActivityLog[]>>(new Map());
  const [activityLoadingIds, setActivityLoadingIds] = useState<string[]>([]);

  const [positionSelectorOpen, setPositionSelectorOpen] = useState(false);
  const [positionSearch, setPositionSearch] = useState("");
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [manageViewsOpen, setManageViewsOpen] = useState(false);

  const [personalViews, setPersonalViews] = useState<PersonalView[]>([]);
  const [viewsHydrated, setViewsHydrated] = useState(false);

  const rootBoardRef = useRef(rootBoard);
  const rowsRef = useRef<ListRow[]>([]);
  const positionMenuRef = useRef<HTMLDivElement | null>(null);
  const columnsMenuRef = useRef<HTMLDivElement | null>(null);
  const viewsMenuRef = useRef<HTMLDivElement | null>(null);
  const viewsStorageKey = "stratum:list-personal-views:v2";

  useEffect(() => {
    rootBoardRef.current = rootBoard;
  }, [rootBoard]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(viewsStorageKey) ?? window.localStorage.getItem("stratum:list-personal-views:v1");
      if (!raw) {
        setViewsHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as PersonalView[];
      if (!Array.isArray(parsed)) {
        setViewsHydrated(true);
        return;
      }
      setPersonalViews(
        parsed.filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string"),
      );
    } catch {
      // ignore invalid local data
    } finally {
      setViewsHydrated(true);
    }
  }, [viewsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !viewsHydrated) return;
    try {
      window.localStorage.setItem(viewsStorageKey, JSON.stringify(personalViews));
    } catch {
      // ignore localStorage failures
    }
  }, [personalViews, viewsHydrated, viewsStorageKey]);

  const closeMenus = useCallback(() => {
    setPositionSelectorOpen(false);
    setColumnsMenuOpen(false);
    setViewsMenuOpen(false);
    setManageViewsOpen(false);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insidePosition = positionMenuRef.current?.contains(target) ?? false;
      const insideColumns = columnsMenuRef.current?.contains(target) ?? false;
      const insideViews = viewsMenuRef.current?.contains(target) ?? false;
      if (!insidePosition && !insideColumns && !insideViews) {
        closeMenus();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenus();
        setFiltersDrawerOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMenus]);

  const setFilters = useCallback(
    (next: Partial<BoardListFilters>) => {
      onFiltersChange(normalizeFilters({ ...normalizedFilters, ...next }, rootBoard.id));
    },
    [normalizedFilters, onFiltersChange, rootBoard.id],
  );

  const setChips = useCallback(
    (patch: Partial<BoardListFilters["chips"]>) => {
      setFilters({ chips: { ...normalizedFilters.chips, ...patch } });
    },
    [normalizedFilters.chips, setFilters],
  );

  const setAdvanced = useCallback(
    (patch: Partial<AdvancedFilters>) => {
      setFilters({ advanced: { ...normalizedFilters.advanced, ...patch } });
    },
    [normalizedFilters.advanced, setFilters],
  );

  const markRowSaving = useCallback((rowId: string, saving: boolean) => {
    setSavingRowIds((prev) => {
      if (saving) {
        if (prev.includes(rowId)) return prev;
        return [...prev, rowId];
      }
      return prev.filter((entry) => entry !== rowId);
    });
  }, []);

  const isRowSaving = useCallback((rowId: string) => savingRowIds.includes(rowId), [savingRowIds]);
  const isCollaboratorsLoading = useCallback(
    (rowId: string) => collaboratorsLoadingIds.includes(rowId),
    [collaboratorsLoadingIds],
  );
  const isActivityLoading = useCallback((rowId: string) => activityLoadingIds.includes(rowId), [activityLoadingIds]);

  const getAssigneeOptionsForRow = useCallback(
    (row: ListRow): Array<{ id: string; label: string }> => {
      const cache = collaboratorsByNodeId.get(row.id) ?? [];
      const merged = new Map<string, string>();
      if (user?.id) {
        merged.set(user.id, "Moi");
      }
      for (const entry of cache) {
        merged.set(entry.id, entry.label);
      }
      row.assigneeIds.forEach((id, index) => {
        const name = row.assignees[index] ?? id;
        if (!merged.has(id)) merged.set(id, name);
      });
      return Array.from(merged.entries()).map(([id, label]) => ({ id, label }));
    },
    [collaboratorsByNodeId, user?.id],
  );

  const ensureCollaboratorsForNode = useCallback(
    async (row: ListRow) => {
      if (!accessToken) return;
      if (collaboratorsByNodeId.has(row.id)) return;
      if (isCollaboratorsLoading(row.id)) return;

      setCollaboratorsLoadingIds((prev) => [...prev, row.id]);
      try {
        const response = await fetchNodeCollaborators(row.id, accessToken);
        const options = response.collaborators
          .map((entry) => ({ id: entry.userId, label: entry.displayName || entry.email }))
          .filter((entry, index, arr) => arr.findIndex((item) => item.id === entry.id) === index);
        setCollaboratorsByNodeId((prev) => {
          const next = new Map(prev);
          next.set(row.id, options);
          return next;
        });
      } catch {
        // ignore collaborator fetch issues to keep editing flow non blocking
      } finally {
        setCollaboratorsLoadingIds((prev) => prev.filter((entry) => entry !== row.id));
      }
    },
    [accessToken, collaboratorsByNodeId, isCollaboratorsLoading],
  );

  const ensureActivityForNode = useCallback(
    async (rowId: string) => {
      if (!accessToken) return;
      if (activityByNodeId.has(rowId)) return;
      if (isActivityLoading(rowId)) return;

      setActivityLoadingIds((prev) => [...prev, rowId]);
      try {
        const logs = await fetchNodeActivity(rowId, accessToken);
        setActivityByNodeId((prev) => {
          const next = new Map(prev);
          next.set(rowId, logs);
          return next;
        });
      } catch {
        // ignore activity fetch issues in tooltip
      } finally {
        setActivityLoadingIds((prev) => prev.filter((entry) => entry !== rowId));
      }
    },
    [accessToken, activityByNodeId, isActivityLoading],
  );

  const loadHierarchy = useCallback(async () => {
    if (!accessToken) return;

    const fetchEntry = async (boardId: string): Promise<BoardHierarchyEntry | null> => {
      try {
        const detail = (await fetchBoardDetail(boardId, accessToken)) ?? (boardId === rootBoardRef.current.id ? rootBoardRef.current : null);
        if (!detail) return null;
        const [breadcrumb, childBoards] = await Promise.all([
          fetchNodeBreadcrumb(detail.nodeId, accessToken),
          fetchChildBoards(detail.nodeId, accessToken),
        ]);
        return {
          board: detail,
          breadcrumb,
          childBoards,
        };
      } catch {
        return null;
      }
    };

    const collectSubtree = async (startBoardId: string): Promise<BoardHierarchyEntry[]> => {
      const output: BoardHierarchyEntry[] = [];
      const queue: string[] = [startBoardId];
      const seen = new Set<string>();

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId || seen.has(currentId)) continue;
        seen.add(currentId);

        const entry = await fetchEntry(currentId);
        if (!entry) continue;
        output.push(entry);

        for (const child of entry.childBoards) {
          if (!seen.has(child.boardId)) {
            queue.push(child.boardId);
          }
        }
      }

      return output;
    };

    setLoading(rowsRef.current.length === 0);
    setError(null);

    try {
      const positionBoardId = normalizedFilters.positionBoardId ?? rootBoard.id;
      const entry = await fetchEntry(positionBoardId);

      if (!entry) {
        throw new Error("Impossible de charger la position actuelle.");
      }

      setPositionEntry(entry);

      let scopeRootBoardId = entry.board.id;
      if (normalizedFilters.scope === "ROOT") {
        const firstAncestorBoardId = entry.breadcrumb.find((item) => item.boardId)?.boardId;
        if (firstAncestorBoardId) {
          scopeRootBoardId = firstAncestorBoardId;
        } else {
          try {
            const root = await fetchRootBoard(accessToken);
            scopeRootBoardId = root.id;
          } catch {
            scopeRootBoardId = entry.board.id;
          }
        }
      }

      let entries: BoardHierarchyEntry[];

      if (normalizedFilters.scope === "CURRENT") {
        entries = [entry];
      } else {
        entries = await collectSubtree(scopeRootBoardId);
        if (!entries.some((candidate) => candidate.board.id === entry.board.id)) {
          entries.push(entry);
        }
      }

      const nextRows: ListRow[] = [];

      for (const boardEntry of entries) {
        const childBoardByNodeId = new Map<string, string>();
        for (const childBoard of boardEntry.childBoards) {
          childBoardByNodeId.set(childBoard.nodeId, childBoard.boardId);
        }

        const pathPrefix = [...boardEntry.breadcrumb.map((item) => item.title), boardEntry.board.name]
          .filter(Boolean)
          .join(" / ");

        for (const column of boardEntry.board.columns) {
          for (const node of column.nodes ?? []) {
            const counts = normalizeCounts(node.counts);
            const childBoardId = childBoardByNodeId.get(node.id) ?? null;
            const hasChildren =
              childBoardId !== null || counts.backlog + counts.inProgress + counts.blocked + counts.done > 0;

            nextRows.push({
              id: node.id,
              shortId: typeof node.shortId === "number" ? node.shortId : null,
              title: node.title,
              description: node.description ?? null,
              boardId: boardEntry.board.id,
              boardName: boardEntry.board.name,
              boardNodeId: boardEntry.board.nodeId,
              parentId: node.parentId ?? null,
              position: node.position,
              columnId: column.id,
              columnName: column.name,
              columnBehavior: column.behaviorKey,
              assigneeIds: (node.assignees ?? []).map((assignee) => assignee.id),
              assignees: (node.assignees ?? []).map((assignee) => assignee.displayName),
              priority: node.priority ?? "NONE",
              progress: typeof node.progress === "number" ? Math.max(0, Math.min(100, node.progress)) : null,
              effort: node.effort ?? null,
              dueAt: node.dueAt ?? null,
              updatedAt: node.updatedAt ?? null,
              pathLabel: pathPrefix,
              childBoardId,
              hasChildren,
              hasRecentComment: Boolean(node.hasRecentComment),
              blockedSince: node.blockedSince ?? null,
              sharedPlacementLocked: Boolean(node.sharedPlacementLocked),
              counts,
            });
          }
        }
      }

      const parentIdsWithChildren = new Set<string>();
      for (const row of nextRows) {
        if (row.parentId) parentIdsWithChildren.add(row.parentId);
      }

      setHierarchy(entries);
      setRows(withRecomputedCounters(nextRows));
      setExpandedIds(Array.from(parentIdsWithChildren));
      setDataRootBoardId(scopeRootBoardId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger la vue liste.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, normalizedFilters.positionBoardId, normalizedFilters.scope, rootBoard.id]);

  useEffect(() => {
    if (!normalizedFilters.positionBoardId) {
      setFilters({ positionBoardId: rootBoard.id });
    }
  }, [normalizedFilters.positionBoardId, rootBoard.id, setFilters]);

  useEffect(() => {
    void loadHierarchy();
  }, [loadHierarchy]);

  const boardById = useMemo(() => {
    const map = new Map<string, BoardHierarchyEntry>();
    for (const entry of hierarchy) {
      map.set(entry.board.id, entry);
    }
    if (positionEntry) {
      map.set(positionEntry.board.id, positionEntry);
    }
    return map;
  }, [hierarchy, positionEntry]);

  const boardOptions = useMemo<BoardOption[]>(() => {
    const optionsById = new Map<string, BoardOption>();
    for (const entry of boardById.values()) {
      const path = [...entry.breadcrumb.map((item) => item.title), entry.board.name].filter(Boolean).join(" > ");
      optionsById.set(entry.board.id, { boardId: entry.board.id, label: entry.board.name, path });
    }

    const ancestorTrail = positionEntry?.breadcrumb ?? [];
    for (let index = 0; index < ancestorTrail.length; index += 1) {
      const item = ancestorTrail[index];
      if (!item.boardId) continue;
      const path = ancestorTrail.slice(0, index + 1).map((entry) => entry.title).join(" > ");
      optionsById.set(item.boardId, {
        boardId: item.boardId,
        label: item.title,
        path,
      });
    }

    const options = Array.from(optionsById.values());
    options.sort((a, b) => a.path.localeCompare(b.path, locale));
    return options;
  }, [boardById, locale, positionEntry?.breadcrumb]);

  const visibleBoardOptions = useMemo(() => {
    const search = normalizeText(positionSearch.trim());
    if (!search) return boardOptions;
    return boardOptions.filter((entry) => normalizeText(entry.path).includes(search));
  }, [boardOptions, positionSearch]);

  const positionPathLabel = useMemo(() => {
    const option = boardOptions.find((entry) => entry.boardId === normalizedFilters.positionBoardId);
    return option?.path ?? rootBoard.name;
  }, [boardOptions, normalizedFilters.positionBoardId, rootBoard.name]);

  const allAssignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      row.assigneeIds.forEach((id, index) => {
        map.set(id, row.assignees[index] ?? id);
      });
    }
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [locale, rows]);

  const queryTokens = useMemo(() => parseQueryTokens(normalizedFilters.query.trim()), [normalizedFilters.query]);

  const hasActiveCriteria = useMemo(() => {
    const adv = normalizedFilters.advanced;
    const mineFromAdvanced = Boolean(user?.id && adv.assigneeIds.includes(user.id));
    const blockedFromAdvanced = adv.behaviors.includes("BLOCKED");
    return (
      normalizedFilters.query.trim().length > 0 ||
      normalizedFilters.chips.mine ||
      mineFromAdvanced ||
      normalizedFilters.chips.overdue ||
      normalizedFilters.chips.today ||
      normalizedFilters.chips.week ||
      normalizedFilters.chips.blocked ||
      blockedFromAdvanced ||
      normalizedFilters.chips.updatedWithinDays !== null ||
      adv.title.trim().length > 0 ||
      adv.description.trim().length > 0 ||
      adv.id.trim().length > 0 ||
      adv.assigneeIds.length > 0 ||
      adv.priorities.length > 0 ||
      adv.behaviors.length > 0 ||
      adv.deadlineFrom.length > 0 ||
      adv.deadlineTo.length > 0 ||
      adv.updatedFrom.length > 0 ||
      adv.updatedTo.length > 0 ||
      adv.hasRecentComment !== "ANY" ||
      adv.hasChildren !== "ANY"
    );
  }, [normalizedFilters, user?.id]);

  const rowsById = useMemo(() => {
    const map = new Map<string, ListRow>();
    for (const row of rows) {
      map.set(row.id, row);
    }
    return map;
  }, [rows]);

  const treeRootParentId = useMemo(() => {
    if (normalizedFilters.scope === "ROOT" && dataRootBoardId) {
      const rootEntry = boardById.get(dataRootBoardId);
      if (rootEntry) return rootEntry.board.nodeId;
    }
    const current = boardById.get(normalizedFilters.positionBoardId ?? rootBoard.id);
    return current?.board.nodeId ?? rootBoard.nodeId;
  }, [
    boardById,
    dataRootBoardId,
    normalizedFilters.positionBoardId,
    normalizedFilters.scope,
    rootBoard.nodeId,
    rootBoard.id,
  ]);

  const filteredRows = useMemo(() => {
    const endOfWeekDiff = getEndOfWeekDiff();
    const now = Date.now();

    const matchesQuery = (row: ListRow): boolean => {
      if (queryTokens.length === 0) return true;

      for (const tokenRaw of queryTokens) {
        let token = tokenRaw.trim();
        if (!token) continue;

        if (token.startsWith("\"") && token.endsWith("\"") && token.length >= 2) {
          token = token.slice(1, -1);
        }

        if (token.startsWith("#")) {
          const digits = token.replace(/[^0-9]/g, "");
          if (!digits) return false;
          if (!String(row.shortId ?? "").includes(digits)) return false;
          continue;
        }

        if (token.startsWith("@")) {
          const mention = normalizeText(token.slice(1));
          if (!mention) return false;
          const hasMention = row.assignees.some((assignee) => normalizeText(assignee).includes(mention));
          if (!hasMention) return false;
          continue;
        }

        if (token.startsWith("!")) {
          const wanted = normalizeText(token.slice(1));
          const rowPriorityLabel = normalizeText(tBoard(`priority.labels.${row.priority}`));
          const rowPriorityValue = normalizeText(row.priority);
          if (!rowPriorityLabel.includes(wanted) && !rowPriorityValue.includes(wanted)) return false;
          continue;
        }

        const normalized = normalizeText(token);
        if (normalized.length < 3) continue;

        const haystack = [
          row.title,
          row.description ?? "",
          row.pathLabel,
          row.columnName,
          String(row.shortId ?? ""),
          row.effort ?? "",
          row.progress !== null ? String(row.progress) : "",
          ...row.assignees,
          row.priority,
        ]
          .map((value) => normalizeText(value))
          .join(" ");

        if (!haystack.includes(normalized)) return false;
      }

      return true;
    };

    const matchesAdvanced = (row: ListRow): boolean => {
      const adv = normalizedFilters.advanced;

      if (adv.title.trim()) {
        if (!normalizeText(row.title).includes(normalizeText(adv.title.trim()))) return false;
      }

      if (adv.description.trim()) {
        if (!normalizeText(row.description ?? "").includes(normalizeText(adv.description.trim()))) return false;
      }

      if (adv.id.trim()) {
        const wanted = adv.id.replace(/[^0-9]/g, "");
        if (!wanted) return false;
        if (!String(row.shortId ?? "").includes(wanted)) return false;
      }

      if (adv.assigneeIds.length > 0) {
        const assigneeSet = new Set(row.assigneeIds);
        const found = adv.assigneeIds.some((id) => assigneeSet.has(id));
        if (!found) return false;
      }

      if (adv.priorities.length > 0 && !adv.priorities.includes(row.priority)) {
        return false;
      }

      if (adv.behaviors.length > 0 && !adv.behaviors.includes(row.columnBehavior)) {
        return false;
      }

      if ((adv.deadlineFrom || adv.deadlineTo) && !matchesDateRange(row.dueAt, adv.deadlineFrom, adv.deadlineTo)) {
        return false;
      }

      if ((adv.updatedFrom || adv.updatedTo) && !matchesDateRange(row.updatedAt, adv.updatedFrom, adv.updatedTo)) {
        return false;
      }

      if (!boolFilterMatches(adv.hasRecentComment, row.hasRecentComment)) {
        return false;
      }

      if (!boolFilterMatches(adv.hasChildren, row.hasChildren)) {
        return false;
      }

      return true;
    };

    const matchesQuickChips = (row: ListRow): boolean => {
      const mineQuickActive = Boolean(
        normalizedFilters.chips.mine || (user?.id ? normalizedFilters.advanced.assigneeIds.includes(user.id) : false),
      );
      const blockedQuickActive = Boolean(
        normalizedFilters.chips.blocked || normalizedFilters.advanced.behaviors.includes("BLOCKED"),
      );

      if (mineQuickActive) {
        if (!user?.id || !row.assigneeIds.includes(user.id)) return false;
      }

      const dueDiff = getDueDiff(row.dueAt);

      if (normalizedFilters.chips.overdue) {
        if (dueDiff === null || dueDiff >= 0 || row.columnBehavior === "DONE") return false;
      }

      if (normalizedFilters.chips.today) {
        if (dueDiff !== 0 || row.columnBehavior === "DONE") return false;
      }

      if (normalizedFilters.chips.week) {
        if (dueDiff === null || dueDiff < 0 || dueDiff > endOfWeekDiff || row.columnBehavior === "DONE") return false;
      }

      if (blockedQuickActive) {
        const blocked = row.columnBehavior === "BLOCKED" || Boolean(row.blockedSince);
        if (!blocked) return false;
      }

      if (normalizedFilters.chips.updatedWithinDays !== null) {
        const updated = normalizeDateValue(row.updatedAt);
        if (!updated) return false;
        const diffMs = now - updated.getTime();
        if (diffMs > normalizedFilters.chips.updatedWithinDays * DAY_IN_MS) return false;
      }

      return true;
    };

    return rows.filter((row) => {
      if (!normalizedFilters.includeDone && row.columnBehavior === "DONE") {
        return false;
      }

      if (!matchesQuery(row)) return false;
      if (!matchesQuickChips(row)) return false;
      if (!matchesAdvanced(row)) return false;

      return true;
    });
  }, [normalizedFilters, queryTokens, rows, tBoard, user?.id]);

  const filteredIdSet = useMemo(() => new Set(filteredRows.map((row) => row.id)), [filteredRows]);

  const contextRows = useMemo(() => {
    if (normalizedFilters.renderMode !== "TREE") return new Set<string>();
    if (!normalizedFilters.contextMode) return new Set<string>();
    if (!hasActiveCriteria) return new Set<string>();

    const contextSet = new Set<string>();

    for (const row of filteredRows) {
      let cursor = row.parentId;
      while (cursor) {
        if (cursor === treeRootParentId) break;
        const parent = rowsById.get(cursor);
        if (!parent) break;
        if (!filteredIdSet.has(parent.id)) {
          contextSet.add(parent.id);
        }
        cursor = parent.parentId;
      }
    }

    return contextSet;
  }, [
    filteredIdSet,
    filteredRows,
    hasActiveCriteria,
    normalizedFilters.contextMode,
    normalizedFilters.renderMode,
    rowsById,
    treeRootParentId,
  ]);

  const treeRows = useMemo(() => {
    if (normalizedFilters.renderMode !== "TREE") {
      return [] as Array<{ row: ListRow; depth: number; isContext: boolean; isExpanded: boolean }>;
    }

    const visibleIds = new Set<string>();

    for (const row of filteredRows) {
      visibleIds.add(row.id);
    }

    for (const id of contextRows) {
      visibleIds.add(id);
    }

    const visibleRows = rows.filter((row) => visibleIds.has(row.id));
    const childrenByParent = new Map<string, ListRow[]>();

    for (const row of visibleRows) {
      const parentKey = row.parentId ?? "";
      const existing = childrenByParent.get(parentKey) ?? [];
      existing.push(row);
      childrenByParent.set(parentKey, existing);
    }

    const sortSiblings = (items: ListRow[]) =>
      items.toSorted((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.title.localeCompare(b.title, locale);
      });

    const expanded = new Set(expandedIds);
    const result: Array<{ row: ListRow; depth: number; isContext: boolean; isExpanded: boolean }> = [];

    const rootRows = visibleRows.filter((row) => {
      if (row.parentId === treeRootParentId) return true;
      return !visibleIds.has(row.parentId ?? "");
    });

    const visit = (row: ListRow, depth: number) => {
      const children = sortSiblings(childrenByParent.get(row.id) ?? []);
      const shouldExpand = expanded.has(row.id);
      result.push({ row, depth, isContext: contextRows.has(row.id), isExpanded: children.length > 0 && shouldExpand });
      if (children.length === 0) return;
      if (!shouldExpand) return;

      for (const child of children) {
        visit(child, depth + 1);
      }
    };

    for (const root of sortSiblings(rootRows)) {
      visit(root, 0);
    }

    return result;
  }, [
    contextRows,
    expandedIds,
    filteredRows,
    locale,
    normalizedFilters.renderMode,
    rows,
    treeRootParentId,
  ]);

  const flatRows = useMemo(() => {
    if (normalizedFilters.renderMode !== "FLAT") return [] as ListRow[];

    const sign = normalizedFilters.sort.direction === "asc" ? 1 : -1;

    const compareDate = (a: string | null, b: string | null) => {
      const aTs = normalizeDateValue(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTs = normalizeDateValue(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aTs - bTs;
    };

    const compareStrings = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: "base" });

    return filteredRows.toSorted((a, b) => {
      let value = 0;

      switch (normalizedFilters.sort.field) {
        case "deadline":
          value = compareDate(a.dueAt, b.dueAt);
          break;
        case "priority":
          value = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
          break;
        case "updatedAt":
          value = compareDate(a.updatedAt, b.updatedAt);
          break;
        case "status":
          value = compareStrings(a.columnName, b.columnName);
          break;
        case "assignee":
          value = compareStrings(a.assignees[0] ?? "", b.assignees[0] ?? "");
          break;
        case "title":
          value = compareStrings(a.title, b.title);
          break;
        default:
          value = compareStrings(a.title, b.title);
          break;
      }

      if (value === 0) {
        if (a.position !== b.position) value = a.position - b.position;
        else value = compareStrings(a.title, b.title);
      }

      return value * sign;
    });
  }, [filteredRows, locale, normalizedFilters.renderMode, normalizedFilters.sort.direction, normalizedFilters.sort.field]);

  const visibleColumns = useMemo(() => {
    const source = [...normalizedFilters.visibleColumns];
    const deduped = source.filter((value, index) => source.indexOf(value) === index);
    if (!deduped.includes("title")) deduped.unshift("title");
    if (normalizedFilters.renderMode === "FLAT" && !deduped.includes("path")) deduped.push("path");
    if (normalizedFilters.renderMode === "TREE") return deduped.filter((entry) => entry !== "path" || source.includes("path"));
    return deduped;
  }, [normalizedFilters.renderMode, normalizedFilters.visibleColumns]);

  const tableRows = normalizedFilters.renderMode === "TREE" ? treeRows.map((entry) => entry.row) : flatRows;

  const contextById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of treeRows) {
      map.set(entry.row.id, entry.isContext);
    }
    return map;
  }, [treeRows]);

  const depthById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of treeRows) {
      map.set(entry.row.id, entry.depth);
    }
    return map;
  }, [treeRows]);

  const expandedById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const entry of treeRows) {
      map.set(entry.row.id, entry.isExpanded);
    }
    return map;
  }, [treeRows]);

  const activeViewLabel = useMemo(() => {
    if (!normalizedFilters.activeViewId) return "Vue libre";
    if (normalizedFilters.activeViewId.startsWith("official:")) {
      const official = OFFICIAL_VIEWS.find((entry) => `official:${entry.id}` === normalizedFilters.activeViewId);
      return official?.name ?? "Vue officielle";
    }
    if (normalizedFilters.activeViewId.startsWith("personal:")) {
      const personal = personalViews.find((entry) => `personal:${entry.id}` === normalizedFilters.activeViewId);
      return personal?.name ?? "Vue perso";
    }
    return "Vue";
  }, [normalizedFilters.activeViewId, personalViews]);

  const selectedScope = useMemo(
    () => SCOPE_OPTIONS.find((option) => option.value === normalizedFilters.scope) ?? SCOPE_OPTIONS[0],
    [normalizedFilters.scope],
  );

  const resetAllFilters = useCallback(() => {
    const next = normalizeFilters(
      {
        ...normalizedFilters,
        query: "",
        includeDone: false,
        contextMode: true,
        chips: DEFAULT_LIST_FILTERS.chips,
        advanced: DEFAULT_ADVANCED_FILTERS,
        sort: DEFAULT_LIST_FILTERS.sort,
        activeViewId: null,
      },
      rootBoard.id,
    );
    onFiltersChange(next);
  }, [normalizedFilters, onFiltersChange, rootBoard.id]);

  const mineChipActive = Boolean(
    normalizedFilters.chips.mine || (user?.id ? normalizedFilters.advanced.assigneeIds.includes(user.id) : false),
  );
  const blockedChipActive = Boolean(
    normalizedFilters.chips.blocked || normalizedFilters.advanced.behaviors.includes("BLOCKED"),
  );

  const toggleMineChip = useCallback(() => {
    if (!user?.id) return;
    const willActivate = !mineChipActive;
    setFilters({
      chips: { ...normalizedFilters.chips, mine: willActivate },
      advanced: {
        ...normalizedFilters.advanced,
        assigneeIds: willActivate ? [user.id] : [],
      },
    });
  }, [mineChipActive, normalizedFilters.advanced, normalizedFilters.chips, setFilters, user?.id]);

  const toggleBlockedChip = useCallback(() => {
    const currentBehaviors = normalizedFilters.advanced.behaviors;
    const hasBlockedBehavior = currentBehaviors.includes("BLOCKED");
    const willActivate = !blockedChipActive;
    const nextBehaviors = willActivate
      ? hasBlockedBehavior
        ? currentBehaviors
        : [...currentBehaviors, "BLOCKED"]
      : currentBehaviors.filter((value) => value !== "BLOCKED");

    setFilters({
      chips: { ...normalizedFilters.chips, blocked: willActivate },
      advanced: { ...normalizedFilters.advanced, behaviors: nextBehaviors },
    });
  }, [blockedChipActive, normalizedFilters.advanced, normalizedFilters.chips, setFilters]);

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);

  const moveColumnInVisibility = (column: ListColumnKey, direction: "up" | "down") => {
    const current = [...visibleColumns];
    const index = current.indexOf(column);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    setFilters({ visibleColumns: next });
  };

  const toggleColumnVisibility = (column: ListColumnKey) => {
    const current = [...visibleColumns];
    if (column === "title") return;
    if (normalizedFilters.renderMode === "FLAT" && column === "path") return;

    if (current.includes(column)) {
      setFilters({ visibleColumns: current.filter((entry) => entry !== column) });
      return;
    }

    setFilters({ visibleColumns: [...current, column] });
  };

  const toggleExpand = (rowId: string, shiftKey: boolean) => {
    if (shiftKey) {
      const descendants: string[] = [];
      const queue = [rowId];
      const max = 200;

      while (queue.length > 0 && descendants.length < max) {
        const current = queue.shift();
        if (!current) continue;
        for (const row of rows) {
          if (row.parentId !== current) continue;
          descendants.push(row.id);
          queue.push(row.id);
          if (descendants.length >= max) break;
        }
      }

      if (descendants.length >= max) {
        setNotice("Depliage partiel: limite de 200 lignes atteinte.");
      }

      setExpandedIds((prev) => Array.from(new Set([...prev, rowId, ...descendants])));
      return;
    }

    setExpandedIds((prev) => (prev.includes(rowId) ? prev.filter((entry) => entry !== rowId) : [...prev, rowId]));
  };

  const replaceRow = useCallback((rowId: string, updater: (row: ListRow) => ListRow) => {
    setRows((prev) => {
      const next = prev.map((row) => (row.id === rowId ? updater(row) : row));
      return withRecomputedCounters(next);
    });
  }, []);

  const applyStatusUpdate = async (row: ListRow, targetColumnId: string) => {
    if (!accessToken) return;
    if (!row.parentId) return;

    const board = boardById.get(row.boardId)?.board;
    const targetColumn = board?.columns.find((column) => column.id === targetColumnId);
    if (!targetColumn) return;

    const snapshot = row;

    replaceRow(row.id, (current) => ({
      ...current,
      columnId: targetColumn.id,
      columnName: targetColumn.name,
      columnBehavior: targetColumn.behaviorKey,
    }));

    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await moveChildNode(row.parentId, row.id, { targetColumnId }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour le statut.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const applyPriorityUpdate = async (row: ListRow, priority: PriorityValue) => {
    if (!accessToken) return;
    const snapshot = row;

    replaceRow(row.id, (current) => ({ ...current, priority }));
    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await updateNode(row.id, { priority }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour la priorite.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const applyEffortUpdate = async (row: ListRow, effort: EffortValue | null) => {
    if (!accessToken) return;
    const snapshot = row;

    replaceRow(row.id, (current) => ({ ...current, effort }));
    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await updateNode(row.id, { effort }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour l'effort.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const applyProgressUpdate = async (row: ListRow, progress: number) => {
    if (!accessToken) return;
    const normalized = Math.max(0, Math.min(100, Math.round(progress / 5) * 5));
    const snapshot = row;

    replaceRow(row.id, (current) => ({ ...current, progress: normalized }));
    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await updateNode(row.id, { progress: normalized }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour la progression.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const applyAssigneeUpdate = async (row: ListRow, assigneeId: string | null) => {
    if (!accessToken) return;
    const snapshot = row;
    const options = getAssigneeOptionsForRow(row);
    const label = assigneeId ? options.find((entry) => entry.id === assigneeId)?.label ?? assigneeId : "";

    replaceRow(row.id, (current) => ({
      ...current,
      assigneeIds: assigneeId ? [assigneeId] : [],
      assignees: assigneeId ? [label] : [],
    }));
    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await updateNode(row.id, { raciResponsibleIds: assigneeId ? [assigneeId] : [] }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour l'assignee.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const applyDeadlineUpdate = async (row: ListRow, deadlineDate: string) => {
    if (!accessToken) return;
    const dueAt = deadlineDate ? `${deadlineDate}T00:00:00.000Z` : null;
    const snapshot = row;

    replaceRow(row.id, (current) => ({ ...current, dueAt }));
    markRowSaving(row.id, true);
    setNotice(null);

    try {
      await updateNode(row.id, { dueAt }, accessToken);
      void onDataMutated?.();
    } catch (updateError) {
      replaceRow(row.id, () => snapshot);
      setNotice(updateError instanceof Error ? updateError.message : "Impossible de mettre a jour la deadline.");
    } finally {
      markRowSaving(row.id, false);
    }
  };

  const createTask = async ({ boardId, parentId }: { boardId: string; parentId: string | null }) => {
    if (!accessToken) return;
    const title = window.prompt("Titre de la carte", "Nouvelle carte")?.trim();
    if (!title) return;

    const board = boardById.get(boardId)?.board ?? (await fetchBoardDetail(boardId, accessToken));
    if (!board) {
      setNotice("Board introuvable pour la creation.");
      return;
    }

    const targetColumn = board.columns.find((column) => column.behaviorKey === "BACKLOG") ?? board.columns[0];
    if (!targetColumn) {
      setNotice("Aucune colonne disponible pour creer la carte.");
      return;
    }

    try {
      await createNode({ title, columnId: targetColumn.id, parentId }, accessToken);
      await loadHierarchy();
      void onDataMutated?.();
    } catch (createError) {
      setNotice(createError instanceof Error ? createError.message : "Impossible de creer la carte.");
    }
  };

  const createAtPosition = async () => {
    const boardId = normalizedFilters.positionBoardId ?? rootBoard.id;
    const board = boardById.get(boardId)?.board;
    await createTask({ boardId, parentId: board?.nodeId ?? null });
  };

  const createChild = async (row: ListRow) => {
    if (!accessToken) return;
    try {
      const childBoardId = row.childBoardId ?? (await ensureChildBoard(row.id, accessToken));
      await createTask({ boardId: childBoardId, parentId: row.id });
    } catch (createError) {
      setNotice(createError instanceof Error ? createError.message : "Impossible de creer la carte enfant.");
    }
  };

  const createSibling = async (row: ListRow) => {
    await createTask({ boardId: row.boardId, parentId: row.parentId ?? null });
  };

  const applyOfficialView = (view: OfficialView) => {
    const next: BoardListFilters = normalizeFilters(
      {
        ...normalizedFilters,
        ...view.config,
        positionBoardId: normalizedFilters.positionBoardId ?? rootBoard.id,
        activeViewId: `official:${view.id}`,
      },
      rootBoard.id,
    );

    onFiltersChange(next);
    closeMenus();
  };

  const applyPersonalView = (view: PersonalView) => {
    const next = normalizeFilters(
      {
        ...view.config,
        activeViewId: `personal:${view.id}`,
      },
      rootBoard.id,
    );

    onFiltersChange(next);
    closeMenus();
  };

  const saveAsPersonalView = () => {
    const name = window.prompt("Nom de la vue", "Nouvelle vue")?.trim();
    if (!name) return;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: PersonalView = {
      id,
      name,
      config: normalizeFilters(
        {
          ...normalizedFilters,
          activeViewId: `personal:${id}`,
        },
        rootBoard.id,
      ),
    };

    setPersonalViews((prev) => [...prev, entry]);
    onFiltersChange({ ...entry.config, activeViewId: `personal:${id}` });
  };

  const savePersonalView = () => {
    if (!normalizedFilters.activeViewId?.startsWith("personal:")) {
      saveAsPersonalView();
      return;
    }

    const personalId = normalizedFilters.activeViewId.replace("personal:", "");
    setPersonalViews((prev) =>
      prev.map((entry) =>
        entry.id === personalId
          ? {
              ...entry,
              config: normalizeFilters(
                {
                  ...normalizedFilters,
                  activeViewId: `personal:${personalId}`,
                },
                rootBoard.id,
              ),
            }
          : entry,
      ),
    );
  };

  const deletePersonalView = (id: string) => {
    setPersonalViews((prev) => prev.filter((entry) => entry.id !== id));
    if (normalizedFilters.activeViewId === `personal:${id}`) {
      applyOfficialView(OFFICIAL_VIEWS[2]);
    }
  };

  const dueLabel = (dueAt: string | null) => {
    const diff = getDueDiff(dueAt);
    if (diff === null) return "Sans deadline";
    if (diff === 0) return "Aujourd'hui";
    if (diff > 0) return `Dans ${diff}j`;
    return `Retard ${Math.abs(diff)}j`;
  };

  const showInitialLoading = loading && rows.length === 0;
  const showRefreshing = loading && rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-card/70 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div ref={positionMenuRef} className="relative min-w-[280px] flex-1">
            <button
              type="button"
              onClick={() => {
                setColumnsMenuOpen(false);
                setViewsMenuOpen(false);
                setManageViewsOpen(false);
                setPositionSelectorOpen((prev) => !prev);
              }}
              className="w-full rounded-xl border border-white/15 bg-surface/70 px-3 py-2 text-left text-sm text-foreground transition hover:border-accent"
            >
              <span className="block text-[11px] uppercase tracking-wide text-muted">Position</span>
              <span className="block truncate">{positionPathLabel}</span>
            </button>
            {positionSelectorOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl">
                <input
                  value={positionSearch}
                  onChange={(event) => setPositionSearch(event.target.value)}
                  placeholder="Rechercher un kanban..."
                  className="mb-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                />
                <div className="max-h-60 overflow-y-auto">
                  {visibleBoardOptions.map((option) => (
                    <button
                      key={option.boardId}
                      type="button"
                      onClick={() => {
                        setFilters({ positionBoardId: option.boardId });
                        setPositionSelectorOpen(false);
                      }}
                      className="w-full rounded-lg px-2 py-2 text-left text-xs text-muted transition hover:bg-white/5 hover:text-foreground"
                    >
                      {option.path}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <label className="min-w-[230px] text-xs text-muted">
            Zone d&apos;affichage
            <select
              value={normalizedFilters.scope}
              onChange={(event) => setFilters({ scope: event.target.value as ListScope })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent [color-scheme:dark]"
            >
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="relative min-w-[260px] flex-1">
            <input
              type="search"
              value={normalizedFilters.query}
              onChange={(event) => setFilters({ query: event.target.value })}
              placeholder="Titre, description, #id, @utilisateur, priorite... (3 car. min.)"
              className="w-full rounded-xl border border-white/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Position active: <span className="text-foreground">{positionPathLabel}</span> · {selectedScope.helper}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-white/10 bg-surface/60 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setFilters({ renderMode: "TREE", visibleColumns: TREE_COLUMNS_DEFAULT })}
              className={`rounded-full px-3 py-1 transition ${
                normalizedFilters.renderMode === "TREE" ? "bg-accent text-background" : "text-muted hover:text-foreground"
              }`}
            >
              Arbre
            </button>
            <button
              type="button"
              onClick={() => setFilters({ renderMode: "FLAT", visibleColumns: FLAT_COLUMNS_DEFAULT })}
              className={`rounded-full px-3 py-1 transition ${
                normalizedFilters.renderMode === "FLAT" ? "bg-accent text-background" : "text-muted hover:text-foreground"
              }`}
            >
              A plat
            </button>
          </div>

          <div ref={columnsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setPositionSelectorOpen(false);
                setViewsMenuOpen(false);
                setManageViewsOpen(false);
                setColumnsMenuOpen((prev) => !prev);
              }}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
            >
              Colonnes
            </button>
            {columnsMenuOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl">
                <div className="space-y-2 text-xs">
                  {(normalizedFilters.renderMode === "FLAT" ? FLAT_COLUMNS_DEFAULT : TREE_COLUMNS_DEFAULT).map((column) => {
                    const checked = visibleColumns.includes(column);
                    const disabled = column === "title" || (normalizedFilters.renderMode === "FLAT" && column === "path");
                    return (
                      <div key={column} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1">
                        <label className="flex items-center gap-2 text-muted">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleColumnVisibility(column)}
                          />
                          <span>{COLUMN_LABELS[column]}</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => moveColumnInVisibility(column, "up")}
                            className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-foreground"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveColumnInVisibility(column, "down")}
                            className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-foreground"
                          >
                            ↓
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div ref={viewsMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setPositionSelectorOpen(false);
                setColumnsMenuOpen(false);
                setViewsMenuOpen((prev) => !prev);
              }}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
            >
              Vues: {activeViewLabel}
            </button>
            {viewsMenuOpen && (
              <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-white/10 bg-surface/95 p-3 shadow-2xl">
                <p className="text-[11px] uppercase tracking-wide text-muted">Officielles</p>
                <div className="mt-2 space-y-1">
                  {OFFICIAL_VIEWS.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => applyOfficialView(view)}
                      className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted transition hover:bg-white/5 hover:text-foreground"
                    >
                      ⭐ {view.name}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-[11px] uppercase tracking-wide text-muted">Mes vues</p>
                <div className="mt-2 space-y-1">
                  {personalViews.length === 0 ? (
                    <p className="text-xs text-muted">Aucune vue personnelle.</p>
                  ) : (
                    personalViews.map((view) => (
                      <div key={view.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyPersonalView(view)}
                          className="flex-1 rounded-lg px-2 py-1.5 text-left text-xs text-muted transition hover:bg-white/5 hover:text-foreground"
                        >
                          {view.name}
                        </button>
                        {manageViewsOpen && (
                          <button
                            type="button"
                            onClick={() => deletePersonalView(view.id)}
                            className="rounded border border-rose-400/40 px-2 py-1 text-[10px] text-rose-200 transition hover:border-rose-300"
                          >
                            Suppr.
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={savePersonalView}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={saveAsPersonalView}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Enregistrer sous...
                  </button>
                  <button
                    type="button"
                    onClick={() => setManageViewsOpen((prev) => !prev)}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-accent hover:text-foreground"
                  >
                    Gerer...
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              closeMenus();
              setFiltersDrawerOpen(true);
            }}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
          >
            Filtres
          </button>

          <button
            type="button"
            onClick={() => setFilters({ includeDone: !normalizedFilters.includeDone })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              normalizedFilters.includeDone
                ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-100"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            {normalizedFilters.includeDone ? "Inclure termine" : "Termine OFF"}
          </button>

          {normalizedFilters.renderMode === "TREE" && (
            <button
              type="button"
              onClick={() => setFilters({ contextMode: !normalizedFilters.contextMode })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                normalizedFilters.contextMode
                  ? "border-accent/60 bg-accent/10 text-foreground"
                  : "border-white/15 text-muted hover:border-accent hover:text-foreground"
              }`}
              title="Affiche les parents necessaires pour comprendre le contexte"
            >
              Parents contexte: {normalizedFilters.contextMode ? "ON" : "OFF"}
            </button>
          )}

          <button
            type="button"
            onClick={resetAllFilters}
            className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
          >
            Tout effacer
          </button>

          <button
            type="button"
            onClick={createAtPosition}
            className="ml-auto rounded-full bg-accent px-3 py-1 text-xs font-semibold text-background transition hover:bg-accent-strong"
          >
            + Carte
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={toggleMineChip}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              mineChipActive
                ? "border-accent/60 bg-accent/10 text-foreground"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            Mes taches
          </button>
          <button
            type="button"
            onClick={() => setChips({ overdue: !normalizedFilters.chips.overdue })}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              normalizedFilters.chips.overdue
                ? "border-accent/60 bg-accent/10 text-foreground"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            En retard
          </button>
          <button
            type="button"
            onClick={() => setChips({ today: !normalizedFilters.chips.today })}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              normalizedFilters.chips.today
                ? "border-accent/60 bg-accent/10 text-foreground"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            Deadline aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => setChips({ week: !normalizedFilters.chips.week })}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              normalizedFilters.chips.week
                ? "border-accent/60 bg-accent/10 text-foreground"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            Fin de semaine
          </button>
          <button
            type="button"
            onClick={toggleBlockedChip}
            className={`rounded-full border px-3 py-1 font-semibold transition ${
              blockedChipActive
                ? "border-accent/60 bg-accent/10 text-foreground"
                : "border-white/15 text-muted hover:border-accent hover:text-foreground"
            }`}
          >
            Bloquees
          </button>
          <label className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground">
            Mis a jour {"<"} Xj
            <select
              value={normalizedFilters.chips.updatedWithinDays ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const parsed = value ? Number(value) : null;
                setChips({
                  updatedWithinDays:
                    parsed === 1 || parsed === 3 || parsed === 7 || parsed === 14 || parsed === 30
                      ? (parsed as UpdatedWithinDays)
                      : null,
                });
              }}
              className="ml-2 rounded bg-surface px-1 text-xs text-foreground outline-none [color-scheme:dark]"
            >
              <option value="">OFF</option>
              <option value="1">1j</option>
              <option value="3">3j</option>
              <option value="7">7j</option>
              <option value="14">14j</option>
              <option value="30">30j</option>
            </select>
          </label>
          {normalizedFilters.renderMode === "FLAT" ? (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-xs text-muted">
                Tri
                <select
                  value={normalizedFilters.sort.field}
                  onChange={(event) =>
                    setFilters({ sort: { ...normalizedFilters.sort, field: event.target.value as SortField } })
                  }
                  className="ml-2 rounded border border-white/15 bg-surface px-2 py-1 text-xs text-foreground"
                >
                  {SORT_FIELDS.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    sort: {
                      ...normalizedFilters.sort,
                      direction: normalizedFilters.sort.direction === "asc" ? "desc" : "asc",
                    },
                  })
                }
                className="rounded border border-white/15 px-2 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
              >
                {normalizedFilters.sort.direction === "asc" ? "Asc" : "Desc"}
              </button>
            </div>
          ) : (
            <span className="ml-auto text-xs text-muted">Tri global desactive en mode Arbre (tri naturel des siblings).</span>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">{notice}</div>
      )}

      {showInitialLoading && (
        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 text-sm text-muted">Chargement de la vue liste...</div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">{error}</div>
      )}

      {!error && !showInitialLoading && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-card/70">
          {showRefreshing && (
            <div className="border-b border-white/10 bg-white/5 px-3 py-1 text-[11px] text-muted">Mise a jour en cours...</div>
          )}
          <div className="h-[calc(100vh-310px)] min-h-[360px] overflow-auto">
            <table className="min-w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-surface/95">
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted">
                  {visibleColumns.map((column) => (
                    <th key={column} className="px-3 py-2 font-semibold">
                      {COLUMN_LABELS[column]}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
                <tr className="border-b border-white/10 align-top text-[11px] text-muted">
                  {visibleColumns.map((column) => {
                    if (column === "title") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <input
                            value={normalizedFilters.advanced.title}
                            onChange={(event) => setAdvanced({ title: event.target.value })}
                            placeholder="Filtrer titre..."
                            className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                          />
                        </th>
                      );
                    }

                    if (column === "status") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <select
                            value={normalizedFilters.advanced.behaviors[0] ?? ""}
                            onChange={(event) => {
                              const behavior = event.target.value as ColumnBehaviorKey;
                              const hasBehavior = behavior.length > 0;
                              setFilters({
                                chips: {
                                  ...normalizedFilters.chips,
                                  blocked: hasBehavior && behavior === "BLOCKED",
                                },
                                advanced: {
                                  ...normalizedFilters.advanced,
                                  behaviors: hasBehavior ? [behavior] : [],
                                  statusColumnIds: [],
                                },
                              });
                            }}
                            className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                          >
                            <option value="">Tous</option>
                            {(["BACKLOG", "IN_PROGRESS", "BLOCKED", "DONE"] as ColumnBehaviorKey[]).map((behavior) => (
                              <option key={behavior} value={behavior}>
                                {tBoard(`behaviors.${behavior}`)}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    }

                    if (column === "priority") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <select
                            value={normalizedFilters.advanced.priorities[0] ?? ""}
                            onChange={(event) =>
                              setAdvanced({
                                priorities: event.target.value ? [event.target.value as PriorityValue] : [],
                              })
                            }
                            className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                          >
                            <option value="">Toutes</option>
                            {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST", "NONE"] as PriorityValue[]).map((priority) => (
                              <option key={priority} value={priority}>
                                {tBoard(`priority.labels.${priority}`)}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    }

                    if (column === "assignee") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <select
                            value={normalizedFilters.advanced.assigneeIds[0] ?? ""}
                            onChange={(event) =>
                              setAdvanced({ assigneeIds: event.target.value ? [event.target.value] : [] })
                            }
                            className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                          >
                            <option value="">Tous</option>
                            {allAssignees.map((assignee) => (
                              <option key={assignee.id} value={assignee.id}>
                                {assignee.label}
                              </option>
                            ))}
                          </select>
                        </th>
                      );
                    }

                    if (column === "deadline") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <div className="flex flex-col gap-1">
                            <input
                              type="date"
                              value={normalizedFilters.advanced.deadlineFrom}
                              onChange={(event) => setAdvanced({ deadlineFrom: event.target.value })}
                              className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                            />
                            <input
                              type="date"
                              value={normalizedFilters.advanced.deadlineTo}
                              onChange={(event) => setAdvanced({ deadlineTo: event.target.value })}
                              className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                            />
                          </div>
                        </th>
                      );
                    }

                    if (column === "updatedAt") {
                      return (
                        <th key={`${column}-filter`} className="px-3 py-2 font-normal">
                          <div className="flex flex-col gap-1">
                            <input
                              type="date"
                              value={normalizedFilters.advanced.updatedFrom}
                              onChange={(event) => setAdvanced({ updatedFrom: event.target.value })}
                              className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                            />
                            <input
                              type="date"
                              value={normalizedFilters.advanced.updatedTo}
                              onChange={(event) => setAdvanced({ updatedTo: event.target.value })}
                              className="w-full rounded border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent [color-scheme:dark]"
                            />
                          </div>
                        </th>
                      );
                    }

                    return (
                      <th key={`${column}-filter`} className="px-3 py-2 font-normal text-[10px] text-muted/60">
                        -
                      </th>
                    );
                  })}
                  <th className="px-3 py-2 text-right font-normal">
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="rounded border border-white/15 px-2 py-1 text-[10px] text-muted transition hover:border-accent hover:text-foreground"
                    >
                      Reset
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={visibleColumns.length + 1} className="px-3 py-8 text-center">
                      <p className="text-sm text-muted">Aucun resultat pour ces filtres.</p>
                      <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setFilters({ includeDone: true })}
                          className="rounded-full border border-white/15 px-3 py-1 text-muted transition hover:border-accent hover:text-foreground"
                        >
                          Inclure termine
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilters({ scope: "ROOT" })}
                          className="rounded-full border border-white/15 px-3 py-1 text-muted transition hover:border-accent hover:text-foreground"
                        >
                          Elargir zone
                        </button>
                        <button
                          type="button"
                          onClick={resetAllFilters}
                          className="rounded-full border border-white/15 px-3 py-1 text-muted transition hover:border-accent hover:text-foreground"
                        >
                          Tout effacer
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {tableRows.map((row) => {
                  const depth = normalizedFilters.renderMode === "TREE" ? depthById.get(row.id) ?? 0 : 0;
                  const isContextRow = normalizedFilters.renderMode === "TREE" ? Boolean(contextById.get(row.id)) : false;
                  const childrenCount = rows.filter((entry) => entry.parentId === row.id).length;
                  const expanded = expandedById.get(row.id) ?? false;
                  const rowDisabled = isRowSaving(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-white/5 align-top transition hover:bg-white/[0.03] ${isContextRow ? "opacity-60" : "opacity-100"}`}
                    >
                      {visibleColumns.map((column) => {
                        if (column === "title") {
                          return (
                            <td key={column} className="px-3 py-2">
                              <div className="flex items-start gap-2" style={{ paddingLeft: normalizedFilters.renderMode === "TREE" ? depth * 14 : 0 }}>
                                {normalizedFilters.renderMode === "TREE" ? (
                                  <button
                                    type="button"
                                    onClick={(event) => toggleExpand(row.id, event.shiftKey)}
                                    disabled={childrenCount === 0}
                                    className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-xs transition ${
                                      childrenCount > 0
                                        ? "text-muted hover:bg-white/5 hover:text-foreground"
                                        : "cursor-default text-muted/30"
                                    }`}
                                    title={childrenCount > 0 ? "Deplier/replier (Shift: sous-arbre)" : "Pas d'enfants"}
                                  >
                                    {childrenCount > 0 ? (
                                      <span className="material-symbols-outlined text-[16px] leading-none">
                                        {expanded ? "expand_more" : "chevron_right"}
                                      </span>
                                    ) : (
                                      <span className="material-symbols-outlined text-[14px] leading-none">fiber_manual_record</span>
                                    )}
                                  </button>
                                ) : null}
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {row.shortId !== null && <span className="text-xs font-semibold text-muted">#{row.shortId}</span>}
                                    <button
                                      type="button"
                                      onClick={() => onOpenTask(row.id)}
                                      title={row.description?.trim() || row.title}
                                      className="truncate text-left text-sm font-semibold text-foreground transition hover:text-accent"
                                    >
                                      {row.title}
                                    </button>
                                    {isContextRow && (
                                      <span className="rounded-full border border-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                                        Contexte
                                      </span>
                                    )}
                                  </div>
                                  {normalizedFilters.renderMode === "FLAT" && (
                                    <div className="truncate text-xs text-muted">{row.pathLabel}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        if (column === "status") {
                          const board = boardById.get(row.boardId)?.board;
                          const options = board?.columns ?? [];

                          return (
                            <td key={column} className="px-3 py-2">
                              <select
                                value={row.columnId}
                                onChange={(event) => void applyStatusUpdate(row, event.target.value)}
                                disabled={rowDisabled || row.sharedPlacementLocked}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60"
                                title={row.sharedPlacementLocked ? "Deplacement verrouille pour ce partage" : "Modifier statut"}
                              >
                                {options.map((columnOption) => (
                                  <option key={columnOption.id} value={columnOption.id}>
                                    {columnOption.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        if (column === "priority") {
                          return (
                            <td key={column} className="px-3 py-2">
                              <select
                                value={row.priority}
                                onChange={(event) => void applyPriorityUpdate(row, event.target.value as PriorityValue)}
                                disabled={rowDisabled}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60"
                              >
                                <option value="CRITICAL">{tBoard("priority.labels.CRITICAL")}</option>
                                <option value="HIGH">{tBoard("priority.labels.HIGH")}</option>
                                <option value="MEDIUM">{tBoard("priority.labels.MEDIUM")}</option>
                                <option value="LOW">{tBoard("priority.labels.LOW")}</option>
                                <option value="LOWEST">{tBoard("priority.labels.LOWEST")}</option>
                                <option value="NONE">{tBoard("priority.labels.NONE")}</option>
                              </select>
                            </td>
                          );
                        }

                        if (column === "progress") {
                          const progressValue = row.progress ?? 0;
                          return (
                            <td key={column} className="px-3 py-2">
                              <select
                                value={progressValue}
                                onChange={(event) => void applyProgressUpdate(row, Number(event.target.value))}
                                disabled={rowDisabled}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60 [color-scheme:dark]"
                              >
                                {Array.from({ length: 21 }, (_, idx) => idx * 5).map((value) => (
                                  <option key={value} value={value}>
                                    {value}%
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }

                        if (column === "effort") {
                          return (
                            <td key={column} className="px-3 py-2">
                              <select
                                value={row.effort ?? ""}
                                onChange={(event) =>
                                  void applyEffortUpdate(
                                    row,
                                    event.target.value ? (event.target.value as EffortValue) : null,
                                  )
                                }
                                disabled={rowDisabled}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60 [color-scheme:dark]"
                              >
                                <option value="">{tBoard("filters.effort.noEffort")}</option>
                                <option value="UNDER2MIN">{tBoard("filters.effort.options.UNDER2MIN")}</option>
                                <option value="XS">{tBoard("filters.effort.options.XS")}</option>
                                <option value="S">{tBoard("filters.effort.options.S")}</option>
                                <option value="M">{tBoard("filters.effort.options.M")}</option>
                                <option value="L">{tBoard("filters.effort.options.L")}</option>
                                <option value="XL">{tBoard("filters.effort.options.XL")}</option>
                                <option value="XXL">{tBoard("filters.effort.options.XXL")}</option>
                              </select>
                            </td>
                          );
                        }

                        if (column === "assignee") {
                          const assigneeOptions = getAssigneeOptionsForRow(row);
                          return (
                            <td key={column} className="px-3 py-2">
                              <select
                                value={row.assigneeIds[0] ?? ""}
                                onFocus={() => void ensureCollaboratorsForNode(row)}
                                onChange={(event) => void applyAssigneeUpdate(row, event.target.value || null)}
                                disabled={rowDisabled}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60 [color-scheme:dark]"
                              >
                                <option value="">Non assigne</option>
                                {assigneeOptions.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {isCollaboratorsLoading(row.id) && (
                                <div className="mt-1 text-[10px] text-muted">Chargement des acces...</div>
                              )}
                            </td>
                          );
                        }

                        if (column === "deadline") {
                          const dateValue = row.dueAt ? row.dueAt.slice(0, 10) : "";
                          return (
                            <td key={column} className="space-y-1 px-3 py-2">
                              <input
                                type="date"
                                value={dateValue}
                                onChange={(event) => void applyDeadlineUpdate(row, event.target.value)}
                                disabled={rowDisabled}
                                className="w-full rounded-lg border border-white/10 bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60"
                              />
                              <div className="text-[11px] text-muted">{dueLabel(row.dueAt)}</div>
                            </td>
                          );
                        }

                        if (column === "updatedAt") {
                          const activityLogs = activityByNodeId.get(row.id) ?? [];
                          return (
                            <td key={column} className="px-3 py-2 text-xs text-muted">
                              <div className="group relative inline-flex items-center gap-2">
                                <span>{row.updatedAt ? dateFormatter.format(new Date(row.updatedAt)) : "-"}</span>
                                <button
                                  type="button"
                                  onMouseEnter={() => void ensureActivityForNode(row.id)}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                                  title="Voir les logs de la carte"
                                  aria-label="Voir les logs de la carte"
                                >
                                  <span className="material-symbols-outlined text-[12px]">history</span>
                                </button>
                                <div className="pointer-events-none invisible absolute right-0 top-full z-30 mt-1 w-[360px] rounded-lg border border-white/10 bg-surface/95 p-2 text-[11px] text-foreground opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100">
                                  {isActivityLoading(row.id) ? (
                                    <p className="text-muted">Chargement des logs...</p>
                                  ) : activityLogs.length === 0 ? (
                                    <p className="text-muted">Aucun log recent.</p>
                                  ) : (
                                    <ul className="max-h-56 space-y-1 overflow-y-auto">
                                      {activityLogs.slice(0, 8).map((log) => (
                                        <li key={log.id} className="rounded border border-white/10 px-2 py-1">
                                          <p className="text-[11px] text-foreground">
                                            {formatActivityMessage(log, tActivity, tBoard)}
                                          </p>
                                          <p className="text-[10px] text-muted">
                                            {dateFormatter.format(new Date(log.createdAt))}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        if (column === "counters") {
                          return (
                            <td key={column} className="px-3 py-2">
                              <span className="rounded border border-white/15 px-2 py-1 font-mono text-xs text-muted">
                                {row.counts.backlog}.{row.counts.inProgress}.{row.counts.blocked}.{row.counts.done}
                              </span>
                            </td>
                          );
                        }

                        if (column === "flags") {
                          return (
                            <td key={column} className="px-3 py-2">
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted">
                                {row.columnBehavior === "BLOCKED" && (
                                  <span className="rounded-full border border-rose-400/40 px-2 py-0.5 text-rose-200">Bloque</span>
                                )}
                                {row.hasRecentComment && (
                                  <span className="rounded-full border border-sky-400/40 px-2 py-0.5 text-sky-200">Comment {"<"}24h</span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        if (column === "path") {
                          return (
                            <td key={column} className="max-w-[320px] px-3 py-2 text-xs text-muted" title={row.pathLabel}>
                              <span className="line-clamp-2">{row.pathLabel}</span>
                            </td>
                          );
                        }

                        return (
                          <td key={column} className="px-3 py-2 text-xs text-muted">
                            -
                          </td>
                        );
                      })}

                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => void createChild(row)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                            title="Creer une carte enfant"
                            aria-label="Creer une carte enfant"
                          >
                            <span className="material-symbols-outlined text-[15px]">subdirectory_arrow_right</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void createSibling(row)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                            title="Creer une carte au meme niveau"
                            aria-label="Creer une carte au meme niveau"
                          >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                          </button>
                          {row.childBoardId && (
                            <button
                              type="button"
                              onClick={() => onOpenBoard(row.childBoardId)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                              title="Ouvrir le sous-kanban"
                              aria-label="Ouvrir le sous-kanban"
                            >
                              <span className="material-symbols-outlined text-[15px]">account_tree</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenTask(row.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-white/15 text-muted transition hover:border-accent hover:text-foreground"
                            title="Ouvrir le detail / deplacer"
                            aria-label="Ouvrir le detail / deplacer"
                          >
                            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtersDrawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex justify-end bg-black/40">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Fermer"
            onClick={() => setFiltersDrawerOpen(false)}
          />
          <aside className="relative h-full w-[420px] max-w-[96vw] overflow-y-auto border-l border-white/10 bg-surface/95 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Filtres avances</h3>
              <button
                type="button"
                onClick={() => setFiltersDrawerOpen(false)}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-foreground"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <label className="block text-muted">
                Titre contient
                <input
                  value={normalizedFilters.advanced.title}
                  onChange={(event) => setAdvanced({ title: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-muted">
                Description contient
                <input
                  value={normalizedFilters.advanced.description}
                  onChange={(event) => setAdvanced({ description: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>

              <label className="block text-muted">
                #ID
                <input
                  value={normalizedFilters.advanced.id}
                  onChange={(event) => setAdvanced({ id: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-muted">
                  Deadline de
                  <input
                    type="date"
                    value={normalizedFilters.advanced.deadlineFrom}
                    onChange={(event) => setAdvanced({ deadlineFrom: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-muted">
                  Deadline a
                  <input
                    type="date"
                    value={normalizedFilters.advanced.deadlineTo}
                    onChange={(event) => setAdvanced({ deadlineTo: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-muted">
                  MAJ de
                  <input
                    type="date"
                    value={normalizedFilters.advanced.updatedFrom}
                    onChange={(event) => setAdvanced({ updatedFrom: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block text-muted">
                  MAJ a
                  <input
                    type="date"
                    value={normalizedFilters.advanced.updatedTo}
                    onChange={(event) => setAdvanced({ updatedTo: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  />
                </label>
              </div>
              <div>
                <p className="mb-2 text-muted">Priorites</p>
                <div className="flex flex-wrap gap-2">
                  {(["CRITICAL", "HIGH", "MEDIUM", "LOW", "LOWEST", "NONE"] as PriorityValue[]).map((priority) => {
                    const active = normalizedFilters.advanced.priorities.includes(priority);
                    return (
                      <button
                        key={priority}
                        type="button"
                        onClick={() => {
                          const current = normalizedFilters.advanced.priorities;
                          setAdvanced({
                            priorities: active ? current.filter((value) => value !== priority) : [...current, priority],
                          });
                        }}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                          active
                            ? "border-accent/60 bg-accent/10 text-foreground"
                            : "border-white/15 text-muted hover:border-accent hover:text-foreground"
                        }`}
                      >
                        {tBoard(`priority.labels.${priority}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-muted">Comportements</p>
                <div className="flex flex-wrap gap-2">
                  {(["BACKLOG", "IN_PROGRESS", "BLOCKED", "DONE"] as ColumnBehaviorKey[]).map((behavior) => {
                    const active = normalizedFilters.advanced.behaviors.includes(behavior);
                    return (
                      <button
                        key={behavior}
                        type="button"
                        onClick={() => {
                          const current = normalizedFilters.advanced.behaviors;
                          const nextBehaviors = active
                            ? current.filter((value) => value !== behavior)
                            : [...current, behavior];
                          setFilters({
                            chips: {
                              ...normalizedFilters.chips,
                              blocked: nextBehaviors.includes("BLOCKED"),
                            },
                            advanced: {
                              ...normalizedFilters.advanced,
                              behaviors: nextBehaviors,
                              statusColumnIds: [],
                            },
                          });
                        }}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                          active
                            ? "border-accent/60 bg-accent/10 text-foreground"
                            : "border-white/15 text-muted hover:border-accent hover:text-foreground"
                        }`}
                      >
                        {tBoard(`behaviors.${behavior}`)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-muted">Assignees</p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 p-2">
                  {allAssignees.map((assignee) => {
                    const checked = normalizedFilters.advanced.assigneeIds.includes(assignee.id);
                    return (
                      <label key={assignee.id} className="flex items-center gap-2 py-1 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const current = normalizedFilters.advanced.assigneeIds;
                            const nextAssigneeIds = checked
                              ? current.filter((value) => value !== assignee.id)
                              : [...current, assignee.id];
                            const mineOn = Boolean(user?.id && nextAssigneeIds.includes(user.id));
                            setFilters({
                              chips: { ...normalizedFilters.chips, mine: mineOn },
                              advanced: {
                                ...normalizedFilters.advanced,
                                assigneeIds: nextAssigneeIds,
                              },
                            });
                          }}
                        />
                        <span>{assignee.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-muted">
                  A commentaires {"<"}24h
                  <select
                    value={normalizedFilters.advanced.hasRecentComment}
                    onChange={(event) => setAdvanced({ hasRecentComment: event.target.value as BoolFilter })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  >
                    <option value="ANY">Indifferent</option>
                    <option value="YES">Oui</option>
                    <option value="NO">Non</option>
                  </select>
                </label>
                <label className="block text-muted">
                  A des enfants
                  <select
                    value={normalizedFilters.advanced.hasChildren}
                    onChange={(event) => setAdvanced({ hasChildren: event.target.value as BoolFilter })}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-2 py-2 text-sm text-foreground"
                  >
                    <option value="ANY">Indifferent</option>
                    <option value="YES">Oui</option>
                    <option value="NO">Non</option>
                  </select>
                </label>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFilters({ advanced: DEFAULT_ADVANCED_FILTERS })}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-foreground"
                >
                  Reinitialiser avances
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersDrawerOpen(false)}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-background transition hover:bg-accent-strong"
                >
                  Appliquer
                </button>
              </div>
            </div>
          </aside>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default BoardListView;
