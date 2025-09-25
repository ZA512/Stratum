const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

import type { BoardNode } from "@/features/boards/boards-api";
import type { NodeDetail } from "./types";

export type CreateNodeInput = {
  title: string;
  columnId: string;
  parentId?: string | null;
  description?: string | null;
  dueAt?: string | null;
};

export type UpdateNodeInput = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  progress?: number;
  blockedReminderEmails?: string[];
  blockedReminderIntervalDays?: number | null;
  blockedExpectedUnblockAt?: string | null;
  priority?: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  effort?: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  tags?: string[];
};

export async function createNode(input: CreateNodeInput, accessToken: string): Promise<BoardNode> {
  const response = await fetch(`${API_BASE_URL}/nodes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ...input }),
  });

  if (!response.ok) {
    await throwNodeError(response, "Impossible de creer la tache");
  }

  const payload = (await response.json()) as {
    id: string;
    shortId: number;
    title: string;
    type: BoardNode["type"];
    columnId: string | null;
    position?: number;
    parentId: string | null;
    dueAt: string | null;
    description?: string | null;
  };

  if (!payload.columnId) {
    throw new Error("La tache creee n'est pas rattachee a une colonne");
  }

  return {
    id: payload.id,
    shortId: payload.shortId,
    title: payload.title,
    type: payload.type,
    columnId: payload.columnId,
    position: payload.position ?? 0,
    parentId: payload.parentId,
    dueAt: payload.dueAt,
    description: payload.description ?? null,
  };
}

type NodeErrorPayload = {
  message?: string;
  error?: string;
};

export async function updateNode(nodeId: string, input: UpdateNodeInput, accessToken: string): Promise<NodeDetail> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    await throwNodeError(response, "Impossible de mettre a jour la tache");
  }
  return (await response.json()) as NodeDetail;
}

export async function fetchNodeDetail(nodeId: string, accessToken: string): Promise<NodeDetail> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/detail`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    await throwNodeError(response, "Impossible de charger le detail de la tache");
  }
  return (await response.json()) as NodeDetail;
}

export async function fetchNodeSummary(nodeId: string, accessToken: string): Promise<{ id: string; hasBoard: boolean; counts: { backlog:number; inProgress:number; blocked:number; done:number } }>{
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/summary`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    await throwNodeError(response, "Impossible de charger le resume de la tache");
  }
  return (await response.json()) as { id: string; hasBoard: boolean; counts: { backlog:number; inProgress:number; blocked:number; done:number } };
}

export type NodeLite = {
  id: string;
  shortId: number;
  teamId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  path: string;
  depth: number;
  columnId: string | null;
  dueAt: string | null;
  statusMetadata: Record<string, unknown> | null;
  progress: number;
  blockedReminderEmails: string[];
  blockedReminderIntervalDays: number | null;
  blockedExpectedUnblockAt: string | null;
  priority: 'NONE'|'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'LOWEST';
  effort: 'UNDER2MIN'|'XS'|'S'|'M'|'L'|'XL'|'XXL' | null;
  tags?: string[];
};

export async function fetchNode(nodeId: string, accessToken: string): Promise<NodeLite> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    await throwNodeError(response, 'Impossible de charger la tache');
  }
  return (await response.json()) as NodeLite;
}

export async function moveChildNode(parentId: string, childId: string, input: { targetColumnId: string; position?: number }, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children/${childId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    await throwNodeError(response, "Impossible de deplacer la tache");
  }
  return (await response.json()) as NodeDetail;
}

async function throwNodeError(response: Response, fallback: string): Promise<never> {
  let message = fallback;

  try {
    const payload = (await response.json()) as NodeErrorPayload;
    message = payload?.message ?? payload?.error ?? fallback;
  } catch {
    // ignore
  }

  throw new Error(message);
}
