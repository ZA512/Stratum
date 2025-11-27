import { API_BASE_URL } from '@/lib/api-config';

export type CreateChildTaskInput = {
  title: string;
  description?: string | null;
  dueAt?: string | null;
};

function authOptions(accessToken: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  return { ...init, headers, cache: 'no-store' };
}

async function throwChildError(response: Response, fallback: string): Promise<never> {
  let message = fallback;
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
    message = payload.message ?? payload.error ?? fallback;
  } catch {}
  const err = new Error(message) as Error & { status?: number };
  err.status = response.status;
  throw err;
}

export async function createChildTask(parentId: string, input: CreateChildTaskInput, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children`, authOptions(accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  }));
  if (!response.ok) {
    await throwChildError(response, 'Impossible de creer la sous-tache');
  }
  return await response.json(); // NodeDetail parent mis à jour
}

export async function toggleChildTaskDone(parentId: string, childId: string, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children/${childId}/toggle-done`, authOptions(accessToken, {
    method: 'POST',
  }));
  if (!response.ok) {
    await throwChildError(response, 'Impossible de changer le statut');
  }
  return await response.json();
}

export type UpdateChildTaskInput = {
  title?: string | null;
  description?: string | null;
  dueAt?: string | null;
};

export async function updateChildTask(parentId: string, childId: string, input: UpdateChildTaskInput, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children/${childId}`, authOptions(accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  }));
  if (!response.ok) {
    await throwChildError(response, 'Impossible de mettre a jour la sous-tache');
  }
  return await response.json();
}

export type MoveChildTaskInput = { targetColumnId: string; position?: number };

export async function moveChildTask(parentId: string, childId: string, input: MoveChildTaskInput, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children/${childId}/move`, authOptions(accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  }));
  if (!response.ok) {
    await throwChildError(response, 'Impossible de deplacer la sous-tache');
  }
  return await response.json();
}

export type ReorderChildrenInput = { columnId: string; orderedIds: string[] };

export async function reorderChildren(parentId: string, input: ReorderChildrenInput, accessToken: string) {
  const response = await fetch(`${API_BASE_URL}/nodes/${parentId}/children/reorder`, authOptions(accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  }));
  if (!response.ok) {
    await throwChildError(response, 'Impossible de reordonner');
  }
  return await response.json();
}
