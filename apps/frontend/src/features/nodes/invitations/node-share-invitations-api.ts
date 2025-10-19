const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type NodeShareIncomingInvitation = {
  id: string;
  nodeId: string;
  nodeTitle: string;
  teamId: string;
  inviterId: string;
  inviterDisplayName: string;
  inviterEmail: string;
  invitedAt: string;
  expiresAt: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
};

export type NodeShareInvitationActionResult = {
  id: string;
  nodeId: string;
  nodeTitle: string;
  teamId: string;
  previousStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";
  respondedAt: string;
  boardId?: string;
  columnId?: string;
  columnBehaviorKey?: string;
};

async function parseError(response: Response): Promise<Error> {
  const fallback = "Impossible de traiter la requête";
  try {
    const text = await response.text();
    if (!text) return new Error(fallback);
    const parsed = JSON.parse(text) as { message?: string } | undefined;
    if (parsed?.message) return new Error(parsed.message);
    return new Error(text);
  } catch {
    return new Error(fallback);
  }
}

export async function fetchIncomingInvitations(accessToken: string): Promise<NodeShareIncomingInvitation[]> {
  const response = await fetch(`${API_BASE_URL}/nodes/invitations`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Non authentifie");
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  const data = await response.json();
  return data as NodeShareIncomingInvitation[];
}

export async function respondToInvitation(
  invitationId: string,
  action: "accept" | "decline",
  accessToken: string,
): Promise<NodeShareInvitationActionResult> {
  const response = await fetch(`${API_BASE_URL}/nodes/invitations/${invitationId}/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("Non authentifie");
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  const result = await response.json();
  return result as NodeShareInvitationActionResult;
}
