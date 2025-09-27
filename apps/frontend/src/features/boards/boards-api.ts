const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

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
  description?: string | null;
  // Enrichissements renvoyés par /boards/:id/detail
  effort?: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  priority?: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  counts?: { backlog: number; inProgress: number; blocked: number; done: number };
  blockedExpectedUnblockAt?: string | null;
  tags?: string[];
  estimatedDurationDays?: number | null;
  assignees?: { id: string; displayName: string; avatarUrl: string | null }[];
};

export type BoardColumn = {
  id: string;
  name: string;
  behaviorKey: string;
  position: number;
  wipLimit: number | null;
  nodes?: BoardNode[];
};

export type Board = {
  id: string;
  nodeId: string;
  name: string;
  columns: BoardColumn[];
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

export async function fetchRootBoard(teamId: string, accessToken: string): Promise<Board> {
  const response = await fetch(`${API_BASE_URL}/boards/team/${teamId}`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger le board");
  }

  return (await response.json()) as Board;
}

export async function fetchBoardDetail(boardId: string, accessToken: string): Promise<Board> {
  const response = await fetch(`${API_BASE_URL}/boards/${boardId}/detail`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger le detail du board");
  }

  return (await response.json()) as Board;
}

export async function fetchNodeBreadcrumb(nodeId: string, accessToken: string): Promise<NodeBreadcrumbItem[]> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/breadcrumb`, createOptions(accessToken));

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
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/children`, createOptions(accessToken));

  if (!response.ok) {
    await throwApiError(response, "Impossible de charger les sous-boards");
  }

  return (await response.json()) as NodeChildBoard[];
}

export async function ensureChildBoard(nodeId: string, accessToken: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/ensure-board`, createOptions(accessToken, { method: 'POST' }));
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
  const response = await fetch(
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
  const response = await fetch(
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
  const response = await fetch(
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
