import { API_BASE_URL } from '@/lib/api-config';
import { authenticatedFetch } from '@/lib/api-client';

export type ColumnBehaviorKey = "BACKLOG" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CUSTOM";

export type BoardNode = {
  id: string;
  shortId: number;
  title: string;
  type: "SIMPLE" | "MEDIUM" | "COMPLEX";
  columnId: string;
  position: number;
  parentId: string | null;
  dueAt: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  scheduleMode?: 'manual' | 'asap' | null;
  hardConstraint?: boolean;
  description?: string | null;
  // Enrichissements renvoyés par /boards/:id/detail
  effort?: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  priority?: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  counts?: { backlog: number; inProgress: number; blocked: number; done: number };
  blockedExpectedUnblockAt?: string | null;
  blockedReminderIntervalDays?: number | null;
  blockedReminderDueInDays?: number | null;
  blockedReminderLastSentAt?: string | null;
  blockedSince?: string | null;
  tags?: string[];
  estimatedDurationDays?: number | null;
  assignees?: { id: string; displayName: string; avatarUrl: string | null }[];
  progress?: number;
  raci?: {
    responsible: { id: string; displayName: string; avatarUrl: string | null }[];
    accountable: { id: string; displayName: string; avatarUrl: string | null }[];
    consulted: { id: string; displayName: string; avatarUrl: string | null }[];
    informed: { id: string; displayName: string; avatarUrl: string | null }[];
  };
  backlogHiddenUntil?: string | null;
  backlogNextReviewAt?: string | null;
  backlogReviewStartedAt?: string | null;
  backlogLastInteractionAt?: string | null;
  backlogLastReminderAt?: string | null;
  lastKnownColumnId?: string | null;
  lastKnownColumnBehavior?: ColumnBehaviorKey | null;
  doneArchiveScheduledAt?: string | null;
  isSnoozed?: boolean;
  isSharedRoot?: boolean;
  canDelete?: boolean;
};

export type ArchivedBoardNode = {
  id: string;
  shortId: number | null;
  title: string;
  archivedAt: string;
  lastKnownColumnId: string | null;
  lastKnownBehavior: ColumnBehaviorKey | null;
  backlogNextReviewAt: string | null;
  backlogReviewStartedAt: string | null;
  backlogHiddenUntil: string | null;
  doneArchiveScheduledAt: string | null;
  dueAt: string | null;
};

export type BoardColumn = {
  id: string;
  name: string;
  behaviorKey: ColumnBehaviorKey;
  position: number;
  wipLimit: number | null;
  nodes?: BoardNode[];
  settings?: Record<string, unknown> | null;
  badges?: { archived: number; snoozed: number };
};

export type BoardGanttDependency = {
  id: string;
  fromId: string;
  toId: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number;
  mode: 'ASAP' | 'FREE';
  hardConstraint: boolean;
};

export type Board = {
  id: string;
  nodeId: string;
  name: string;
  columns: BoardColumn[];
  isShared: boolean; // True si le board contient des tâches partagées avec d'autres utilisateurs
  dependencies: BoardGanttDependency[];
};

export type NodeBreadcrumbItem = {
  id: string;
  title: string;
  type: "SIMPLE" | "MEDIUM" | "COMPLEX";
  depth: number;
  boardId: string | null;
};

export type NodeChildBoard = {
  nodeId: string;
  boardId: string;
  name: string;
};

export type CreateBoardColumnInput = {
  name: string;
  behaviorKey: ColumnBehaviorKey;
  wipLimit?: number | null;
};

export type UpdateBoardColumnInput = {
  name?: string;
  wipLimit?: number | null;
  position?: number;
  backlogSettings?: {
    reviewAfterDays?: number;
    reviewEveryDays?: number;
    archiveAfterDays?: number;
  };
  doneSettings?: {
    archiveAfterDays?: number;
  };
};

function createOptions(accessToken: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return {
    ...init,
    headers,
    cache: "no-store",
  } satisfies RequestInit;
}

// Helper pour utiliser authenticatedFetch avec les mêmes options
async function authFetch(url: string, options: RequestInit): Promise<Response> {
  return authenticatedFetch(url, options);
}

// Cache ETag pour optimiser les requêtes de polling
const etagCache = new Map<string, string>();
// Cache mémoire du dernier payload /boards/:id/detail pour pouvoir exploiter 304 sans perdre les données.
// Important: le BoardDataProvider peut être démonté/remonté lors de la navigation (ex: aller-retour /settings),
// alors que ce module reste en mémoire. Sans ce cache, un 304 renvoie `null` et l'UI se retrouve sans tâches.
const boardDetailCache = new Map<string, Board>();

export async function fetchBoardDetail(boardId: string, accessToken: string): Promise<Board | null> {
  const cachedETag = etagCache.get(boardId);
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`,
  };
  
  // Si on a un ETag en cache, l'inclure pour éviter le transfert inutile
  if (cachedETag) {
    headers['If-None-Match'] = cachedETag;
  }
  
  const response = await authenticatedFetch(`${API_BASE_URL}/boards/${boardId}/detail`, {
    headers,
    cache: "no-store",
  });

  // 304 Not Modified = pas de changement, retourner null pour signaler au caller
  if (response.status === 304) {
    // Si on a déjà un payload en mémoire, le renvoyer pour éviter un board vide côté UI.
    return boardDetailCache.get(boardId) ?? null;
  }

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger le detail du board");
  }

  // Sauvegarder le nouvel ETag pour les prochaines requêtes
  const newETag = response.headers.get('ETag');
  if (newETag) {
    etagCache.set(boardId, newETag);
  }

  const payload = (await response.json()) as Board;
  boardDetailCache.set(boardId, payload);
  return payload;
}

export async function fetchRootBoard(
  ...args: [accessToken: string] | [teamId: string, accessToken: string]
): Promise<Board> {
  const accessToken = args.length === 1 ? args[0] : args[1];
  const response = await authFetch(`${API_BASE_URL}/boards/me`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger le board");
  }

  return (await response.json()) as Board;
}

export async function fetchArchivedNodes(
  boardId: string,
  columnId: string,
  accessToken: string,
): Promise<ArchivedBoardNode[]> {
  const response = await authFetch(
    `${API_BASE_URL}/boards/${boardId}/columns/${columnId}/archived`,
    createOptions(accessToken),
  );

  if (!response.ok) {
    await throwApiError(
      response,
      "Impossible de charger les tâches archivées de la colonne",
    );
  }

  return (await response.json()) as ArchivedBoardNode[];
}

export async function fetchNodeBreadcrumb(nodeId: string, accessToken: string): Promise<NodeBreadcrumbItem[]> {
  const response = await authFetch(`${API_BASE_URL}/nodes/${nodeId}/breadcrumb`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger le breadcrumb");
  }

  const payload = (await response.json()) as {
    items: Array<NodeBreadcrumbItem & { boardId?: string | null }>;
  };

  return payload.items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    depth: item.depth,
    boardId: item.boardId ?? null,
  }));
}

export async function fetchChildBoards(nodeId: string, accessToken: string): Promise<NodeChildBoard[]> {
  const response = await authFetch(`${API_BASE_URL}/nodes/${nodeId}/children`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger les sous-boards");
  }

  return (await response.json()) as NodeChildBoard[];
}

export async function ensureChildBoard(nodeId: string, accessToken: string): Promise<string> {
  const response = await authFetch(`${API_BASE_URL}/nodes/${nodeId}/ensure-board`, createOptions(accessToken, { method: 'POST' }));
  if (!response.ok) {
    await throwApiError(response, 'Impossible de créer le sous-board');
  }
  const payload = await response.json() as { boardId: string };
  return payload.boardId;
}

export async function createBoardColumn(
  boardId: string,
  input: CreateBoardColumnInput,
  accessToken: string,
): Promise<BoardColumn> {
  const response = await authFetch(
    `${API_BASE_URL}/boards/${boardId}/columns`,
    createOptions(accessToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  if (!response.ok) {
    await throwApiError(response, "Impossible de creer la colonne");
  }

  return (await response.json()) as BoardColumn;
}

export async function updateBoardColumn(
  boardId: string,
  columnId: string,
  input: UpdateBoardColumnInput,
  accessToken: string,
): Promise<BoardColumn> {
  const response = await authFetch(
    `${API_BASE_URL}/boards/${boardId}/columns/${columnId}`,
    createOptions(accessToken, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    }),
  );

  if (!response.ok) {
    await throwApiError(response, "Impossible de mettre a jour la colonne");
  }

  return (await response.json()) as BoardColumn;
}

export async function deleteBoardColumn(
  boardId: string,
  columnId: string,
  accessToken: string,
): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/boards/${boardId}/columns/${columnId}`,
    createOptions(accessToken, {
      method: "DELETE",
    }),
  );

  if (!response.ok) {
    await throwApiError(response, "Impossible de supprimer la colonne");
  }
}

type ApiErrorPayload = {
  message?: string;
  error?: string;
};

async function throwApiError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    message = payload?.message ?? payload?.error ?? fallback;
  } catch {
    // ignore JSON parsing errors
  }

  const error = new Error(message) as Error & { status?: number };
  error.status = response.status;
  throw error;
}
