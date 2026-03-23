import { API_BASE_URL } from '@/lib/api-config';

export interface ActivityLog {
  id: string;
  nodeId: string;
  nodeShortId: number | null;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  type: ActivityType;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface BoardActivityStats {
  boardId: string;
  todayCount: number;
}

export interface BoardActivityReportSummary {
  totalEvents: number;
  cardsCreated: number;
  cardsMoved: number;
  commentsAdded: number;
  descriptionsUpdated: number;
  dueDatesUpdated: number;
  progressUpdated: number;
  cardsArchived: number;
  cardsRestored: number;
}

export interface BoardActivityReportItem {
  id: string;
  createdAt: string;
  eventType: string;
  summary: string;
  actorId: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  boardId: string;
  boardName: string;
  nodeId: string;
  nodeShortId: number | null;
  nodeTitle: string;
  parentNodeId: string | null;
  columnId: string | null;
  columnName: string | null;
  fieldKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  commentBody: string | null;
  commentPreview: string | null;
  payload: Record<string, unknown> | null;
}

export interface BoardActivityReport {
  boardId: string;
  boardName: string;
  from: string;
  to: string;
  generatedAt: string;
  summary: BoardActivityReportSummary;
  items: BoardActivityReportItem[];
}

export enum ActivityType {
  SHARE_INVITE_CREATED = 'SHARE_INVITE_CREATED',
  SHARE_INVITE_ACCEPTED = 'SHARE_INVITE_ACCEPTED',
  SHARE_INVITE_DECLINED = 'SHARE_INVITE_DECLINED',
  SHARE_INVITE_EXPIRED = 'SHARE_INVITE_EXPIRED',
  SHARE_LINK_REMOVED = 'SHARE_LINK_REMOVED',
  KANBAN_SOFT_DELETED = 'KANBAN_SOFT_DELETED',
  KANBAN_RESTORED = 'KANBAN_RESTORED',
  KANBAN_MOVED = 'KANBAN_MOVED',
  KANBAN_MOVE_REFUSED = 'KANBAN_MOVE_REFUSED',
  KANBAN_BECAME_SHARED = 'KANBAN_BECAME_SHARED',
  NODE_CREATED = 'NODE_CREATED',
  NODE_MOVED = 'NODE_MOVED',
  MOVED_TO_BOARD = 'MOVED_TO_BOARD',
  NODE_DELETED = 'NODE_DELETED',
  NODE_ARCHIVED = 'NODE_ARCHIVED',
  NODE_RESTORED = 'NODE_RESTORED',
  NODE_SNOOZED = 'NODE_SNOOZED',
  NODE_UNSNOOZED = 'NODE_UNSNOOZED',
  TITLE_UPDATED = 'TITLE_UPDATED',
  DESCRIPTION_UPDATED = 'DESCRIPTION_UPDATED',
  DUE_DATE_UPDATED = 'DUE_DATE_UPDATED',
  PRIORITY_UPDATED = 'PRIORITY_UPDATED',
  EFFORT_UPDATED = 'EFFORT_UPDATED',
  TAGS_UPDATED = 'TAGS_UPDATED',
  PROGRESS_UPDATED = 'PROGRESS_UPDATED',
  BLOCKED_STATUS_CHANGED = 'BLOCKED_STATUS_CHANGED',
  ASSIGNEES_UPDATED = 'ASSIGNEES_UPDATED',
  RACI_UPDATED = 'RACI_UPDATED',
  INVITATION_SENT = 'INVITATION_SENT',
  INVITATION_ACCEPTED = 'INVITATION_ACCEPTED',
  INVITATION_DECLINED = 'INVITATION_DECLINED',
  COLLABORATOR_ADDED = 'COLLABORATOR_ADDED',
  COLLABORATOR_REMOVED = 'COLLABORATOR_REMOVED',
  COMMENT_ADDED = 'COMMENT_ADDED',
}

function createOptions(accessToken: string, init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  };
}

async function throwActivityError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = await response.json();
    if (payload?.message) message = payload.message;
  } catch {
    /* ignore parse errors */
  }
  throw new Error(message);
}

/**
 * Récupère les logs d'activité d'un board
 */
export async function fetchBoardActivity(
  boardId: string,
  accessToken: string,
  limit: number = 50,
): Promise<ActivityLog[]> {
  const response = await fetch(
    `${API_BASE_URL}/activity/boards/${boardId}?limit=${limit}`,
    createOptions(accessToken),
  );

  if (!response.ok) {
    await throwActivityError(response, 'Impossible de charger les activités du board');
  }

  return (await response.json()) as ActivityLog[];
}

/**
 * Récupère les statistiques d'activité d'un board (compteur du jour)
 */
export async function fetchBoardActivityStats(
  boardId: string,
  accessToken: string,
): Promise<BoardActivityStats> {
  const response = await fetch(
    `${API_BASE_URL}/activity/boards/${boardId}/stats`,
    createOptions(accessToken),
  );

  if (!response.ok) {
    await throwActivityError(response, 'Impossible de charger les statistiques d\'activité');
  }

  return (await response.json()) as BoardActivityStats;
}

/**
 * Récupère les logs d'activité d'une tâche spécifique
 */
export async function fetchNodeActivity(
  nodeId: string,
  accessToken: string,
): Promise<ActivityLog[]> {
  const response = await fetch(
    `${API_BASE_URL}/activity/nodes/${nodeId}`,
    createOptions(accessToken),
  );

  if (!response.ok) {
    await throwActivityError(response, 'Impossible de charger les activités de la tâche');
  }

  return (await response.json()) as ActivityLog[];
}

export async function fetchBoardActivityReport(
  boardId: string,
  accessToken: string,
  query: {
    from?: string;
    to?: string;
    actorId?: string;
    eventTypes?: string[];
    query?: string;
    limit?: number;
    scope?: 'board' | 'subtree';
  } = {},
): Promise<BoardActivityReport> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.actorId) params.set('actorId', query.actorId);
  if (query.eventTypes && query.eventTypes.length > 0) {
    params.set('eventTypes', query.eventTypes.join(','));
  }
  if (query.query) params.set('query', query.query);
  if (query.limit) params.set('limit', String(query.limit));
  if (query.scope) params.set('scope', query.scope);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(
    `${API_BASE_URL}/activity/boards/${boardId}/report${suffix}`,
    createOptions(accessToken),
  );

  if (!response.ok) {
    await throwActivityError(response, "Impossible de charger le rapport d'activite");
  }

  return (await response.json()) as BoardActivityReport;
}
