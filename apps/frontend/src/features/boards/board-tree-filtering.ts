import type { BoardTreeNode, ColumnBehaviorKey } from './boards-api';

export type PriorityValue = 'NONE' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'LOWEST';
export type ActivityFilterType = 'CREATION' | 'MODIFICATION' | 'COMMENT';
export type ActivityFilterPeriod = 'ANY' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';

export type BoardFilterShape = {
  searchQuery?: string;
  searchIncludeComments?: boolean;
  assigneeIds?: string[];
  priorities?: PriorityValue[];
  efforts?: string[];
  onlyMine?: boolean;
  hideDone?: boolean;
  statusValues?: ColumnBehaviorKey[];
  productivityPreset?: 'TODAY' | 'OVERDUE' | 'THIS_WEEK' | 'NEXT_7_DAYS' | 'NO_DEADLINE' | null;
  activity?: {
    period?: ActivityFilterPeriod;
    from?: string | null;
    to?: string | null;
    types?: ActivityFilterType[];
  };
};

export type DescendantPreviewItem = {
  nodeId: string;
  title: string;
  boardId: string;
  parentId: string | null;
  depth: number;
};

export type TreeMatchMeta = {
  directMatch: boolean;
  visible: boolean;
  descendantMatchCount: number;
  descendantPreview: DescendantPreviewItem[];
};

const normalizeText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const matchesActivityPeriod = (
  value: string,
  period: ActivityFilterPeriod,
  from?: string | null,
  to?: string | null,
): boolean => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return false;
  const now = new Date();
  const today = startOfDay(now).getTime();
  const dayDiff = Math.floor((today - startOfDay(at).getTime()) / (24 * 60 * 60 * 1000));

  if (period === 'ANY') return true;
  if (period === 'TODAY') return dayDiff === 0;
  if (period === 'LAST_7_DAYS') return dayDiff >= 0 && dayDiff < 7;
  if (period === 'LAST_30_DAYS') return dayDiff >= 0 && dayDiff < 30;
  if (period === 'CUSTOM') {
    const fromTs = from ? startOfDay(new Date(from)).getTime() : Number.NEGATIVE_INFINITY;
    const toTs = to ? startOfDay(new Date(to)).getTime() : Number.POSITIVE_INFINITY;
    const ts = startOfDay(at).getTime();
    return ts >= fromTs && ts <= toTs;
  }
  return true;
};

const matchesProductivity = (node: BoardTreeNode, preset: BoardFilterShape['productivityPreset']): boolean => {
  if (!preset) return true;
  const now = startOfDay(new Date()).getTime();
  const due = node.dueAt ? startOfDay(new Date(node.dueAt)).getTime() : null;
  const diffDays = due === null ? null : Math.round((due - now) / (24 * 60 * 60 * 1000));
  if (preset === 'NO_DEADLINE') return due === null;
  if (due === null) return false;
  if (preset === 'TODAY') return diffDays === 0;
  if (preset === 'OVERDUE') return diffDays < 0;
  if (preset === 'NEXT_7_DAYS') return diffDays >= 0 && diffDays <= 7;
  if (preset === 'THIS_WEEK') {
    const day = new Date().getDay();
    const diffToSunday = day === 0 ? 0 : 7 - day;
    return diffDays >= 0 && diffDays <= diffToSunday;
  }
  return true;
};

const matchesDirect = (
  node: BoardTreeNode,
  filters: BoardFilterShape,
  currentUserId?: string | null,
): boolean => {
  if (filters.hideDone && node.columnBehaviorKey === 'DONE') return false;

  if (filters.statusValues && filters.statusValues.length > 0) {
    if (!filters.statusValues.includes(node.columnBehaviorKey)) return false;
  }

  if (filters.priorities && filters.priorities.length > 0) {
    const priority = node.priority ?? 'NONE';
    if (!filters.priorities.includes(priority)) return false;
  }

  if (filters.onlyMine && currentUserId) {
    if (!node.assigneeIds.includes(currentUserId)) return false;
  }

  if (filters.assigneeIds && filters.assigneeIds.length > 0) {
    const matchesUnassigned =
      filters.assigneeIds.includes('__UNASSIGNED__') && node.assigneeIds.length === 0;
    const matchesAssigned = filters.assigneeIds.some((id) => id !== '__UNASSIGNED__' && node.assigneeIds.includes(id));
    if (!matchesUnassigned && !matchesAssigned) return false;
  }

  if (filters.efforts && filters.efforts.length > 0) {
    const effort = node.effort;
    const matchesNoEffort = filters.efforts.includes('__NO_EFFORT__') && effort === null;
    const matchesEffort = effort ? filters.efforts.includes(effort) : false;
    if (!matchesNoEffort && !matchesEffort) return false;
  }

  if (!matchesProductivity(node, filters.productivityPreset ?? null)) return false;

  const activity = filters.activity;
  if (activity && (activity.period || (activity.types && activity.types.length > 0))) {
    const period = activity.period ?? 'ANY';
    const matches = node.activities.some(
      (entry) =>
        (activity.types && activity.types.length > 0 ? activity.types.includes(entry.type) : true) &&
        matchesActivityPeriod(entry.createdAt, period, activity.from ?? null, activity.to ?? null),
    );
    if (!matches) return false;
  }

  const query = filters.searchQuery?.trim() ?? '';
  if (!query) return true;

  const normalized = normalizeText(query);
  if (!normalized) return true;

  const haystacks = [
    normalizeText(node.title),
    normalizeText(node.description ?? ''),
    normalizeText(node.id),
    normalizeText(String(node.shortId ?? '')),
    ...node.assigneeNames.map((name) => normalizeText(name)),
  ];

  if (filters.searchIncludeComments) {
    haystacks.push(...node.commentBodies.map((body) => normalizeText(body)));
  }

  return haystacks.some((value) => value.includes(normalized));
};

export function evaluateBoardTreeMatches(
  treeNodes: BoardTreeNode[],
  filters: BoardFilterShape,
  currentUserId?: string | null,
): Map<string, TreeMatchMeta> {
  const byId = new Map<string, BoardTreeNode>();
  const childrenByParent = new Map<string | null, BoardTreeNode[]>();
  for (const node of treeNodes) {
    byId.set(node.id, node);
    const key = node.parentId ?? null;
    const bucket = childrenByParent.get(key) ?? [];
    bucket.push(node);
    childrenByParent.set(key, bucket);
  }

  const roots = [...treeNodes]
    .filter((node) => node.depth === 0)
    .sort((a, b) => a.position - b.position);
  const result = new Map<string, TreeMatchMeta>();

  const visit = (node: BoardTreeNode): TreeMatchMeta => {
    const children = [...(childrenByParent.get(node.id) ?? [])].sort((a, b) => a.position - b.position);
    const directMatch = matchesDirect(node, filters, currentUserId);
    let descendantMatchCount = 0;
    const descendantPreview: DescendantPreviewItem[] = [];

    for (const child of children) {
      const meta = visit(child);
      if (meta.directMatch) {
        descendantMatchCount += 1;
        if (descendantPreview.length < 20) {
          descendantPreview.push({
            nodeId: child.id,
            title: child.title,
            boardId: child.boardId,
            parentId: child.parentId,
            depth: child.depth,
          });
        }
      }
      if (meta.descendantMatchCount > 0) {
        descendantMatchCount += meta.descendantMatchCount;
        if (descendantPreview.length < 20) {
          descendantPreview.push(...meta.descendantPreview.slice(0, 20 - descendantPreview.length));
        }
      }
    }

    const visible = directMatch || descendantMatchCount > 0;
    const meta = {
      directMatch,
      visible,
      descendantMatchCount,
      descendantPreview: descendantPreview.slice(0, 20),
    };
    result.set(node.id, meta);
    return meta;
  };

  for (const root of roots) {
    visit(root);
  }

  return result;
}