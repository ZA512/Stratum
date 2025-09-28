const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type NodeCollaborator = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  accessType: 'OWNER' | 'DIRECT' | 'INHERITED' | 'SELF';
  viaNodes: Array<{ nodeId: string; title: string }>;
  addedAt: string | null;
  addedById: string | null;
};

export type NodeCollaboratorInvitation = {
  email: string;
  invitedAt: string | null;
  invitedById: string | null;
  status: 'PENDING' | 'ACCEPTED';
};

export type NodeCollaboratorsResponse = {
  nodeId: string;
  collaborators: NodeCollaborator[];
  invitations: NodeCollaboratorInvitation[];
};

export async function fetchNodeCollaborators(
  nodeId: string,
  accessToken: string,
): Promise<NodeCollaboratorsResponse> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/collaborators`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error("Impossible de charger les collaborateurs");
  }
  return (await response.json()) as NodeCollaboratorsResponse;
}

export async function inviteNodeCollaborator(
  nodeId: string,
  payload: { userId: string },
  accessToken: string,
): Promise<NodeCollaboratorsResponse> {
  const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}/collaborators`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = 'Impossible d\'ajouter le collaborateur';
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return (await response.json()) as NodeCollaboratorsResponse;
}

export async function removeNodeCollaborator(
  nodeId: string,
  userId: string,
  accessToken: string,
): Promise<NodeCollaboratorsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/nodes/${nodeId}/collaborators/${userId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error("Impossible de retirer le collaborateur");
  }
  return (await response.json()) as NodeCollaboratorsResponse;
}
