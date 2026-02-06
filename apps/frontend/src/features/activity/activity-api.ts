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
