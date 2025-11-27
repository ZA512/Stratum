import { API_BASE_URL } from '@/lib/api-config';

import type { NodeComment } from "./types";

export type CreateNodeCommentInput = {
  body: string;
  notifyResponsible?: boolean;
  notifyAccountable?: boolean;
  notifyConsulted?: boolean;
  notifyInformed?: boolean;
  notifyProject?: boolean;
  notifySubProject?: boolean;
  mentions?: string[];
};

async function throwCommentError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    if (payload?.message) message = payload.message;
    else if (payload?.error) message = payload.error;
  } catch {
    // ignore
  }
  throw new Error(message);
}

export async function fetchNodeComments(nodeId: string, accessToken: string): Promise<NodeComment[]> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    await throwCommentError(response, "Impossible de charger les commentaires");
  }
  return (await response.json()) as NodeComment[];
}

export async function createNodeComment(
  nodeId: string,
  input: CreateNodeCommentInput,
  accessToken: string,
): Promise<NodeComment> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    await throwCommentError(response, "Impossible d'ajouter le commentaire");
  }
  return (await response.json()) as NodeComment;
}
