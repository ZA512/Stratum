const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

import type { BoardNode } from "@/features/boards/boards-api";

export type CreateNodeInput = {
  title: string;
  columnId: string;
  parentId?: string | null;
  description?: string | null;
  dueAt?: string | null;
};

export type ConvertNodeInput = {
  targetType: "SIMPLE" | "MEDIUM" | "COMPLEX";
  checklistItems?: string[];
};

export async function createNode(input: CreateNodeInput, accessToken: string): Promise<BoardNode> {
  const response = await fetch(`${API_BASE_URL}/nodes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ...input, type: "SIMPLE" }),
  });

  if (!response.ok) {
    await throwNodeError(response, "Impossible de creer la tache");
  }

  const payload = (await response.json()) as {
    id: string;
    title: string;
    type: BoardNode["type"];
    columnId: string | null;
    position?: number;
    parentId: string | null;
    dueAt: string | null;
  };

  if (!payload.columnId) {
    throw new Error("La tache creee n'est pas rattachee a une colonne");
  }

  return {
    id: payload.id,
    title: payload.title,
    type: payload.type,
    columnId: payload.columnId,
    position: payload.position ?? 0,
    parentId: payload.parentId,
    dueAt: payload.dueAt,
  };
}

type NodeErrorPayload = {
  message?: string;
  error?: string;
};

export async function convertNode(
  nodeId: string,
  input: ConvertNodeInput,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwNodeError(response, "Impossible de convertir la tache");
  }
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
