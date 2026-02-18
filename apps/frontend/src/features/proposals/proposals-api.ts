import { apiGet, apiPost } from '@/lib/api-client';

// --- Types ---

export type ProposalStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'APPROVED'
  | 'APPLIED'
  | 'REJECTED'
  | 'ROLLED_BACK';

export type ProposalActionType =
  | 'CREATE_NODE'
  | 'UPDATE_NODE'
  | 'MOVE_NODE'
  | 'DELETE_NODE';

export type ProposalAction = {
  id: string;
  actionType: ProposalActionType;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  ordering: number;
};

export type Proposal = {
  id: string;
  workspaceId: string;
  userId: string;
  status: ProposalStatus;
  intent: string;
  confidenceScore: number | null;
  actions: ProposalAction[];
  explanation: ProposalExplanation | null;
  createdAt: string;
  updatedAt: string;
};

export type ProposalExplanation = {
  reasoning: string;
  entitiesAffected: string[];
  ragChunksUsed: string[];
  confidenceFactors: string[];
  ruleViolations: string[];
  promptVersion: string | null;
};

// --- API calls ---

async function parseApiError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const payload = (await response.json()) as {
      message?: string;
      error?: string;
    };
    const message = payload?.message || payload?.error || fallback;
    const err = new Error(message);
    (err as { status?: number }).status = response.status;
    return err;
  } catch {
    const err = new Error(fallback);
    (err as { status?: number }).status = response.status;
    return err;
  }
}

export async function fetchProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiGet(
    `workspaces/${workspaceId}/proposals/${proposalId}`,
  );
  if (!response.ok) {
    throw await parseApiError(response, 'Impossible de charger la proposal');
  }
  return (await response.json()) as Proposal;
}

export async function validateProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/validate`,
    {},
  );
  if (!response.ok) {
    throw await parseApiError(response, 'Impossible de valider la proposal');
  }
  return (await response.json()) as Proposal;
}

export async function approveProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/approve`,
    {},
  );
  if (!response.ok) {
    throw await parseApiError(response, "Impossible d'approuver la proposal");
  }
  return (await response.json()) as Proposal;
}

export async function applyProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/apply`,
    {},
  );
  if (!response.ok) {
    throw await parseApiError(response, "Impossible d'appliquer la proposal");
  }
  return (await response.json()) as Proposal;
}

export async function rejectProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/reject`,
    {},
  );
  if (!response.ok) {
    throw await parseApiError(response, 'Impossible de rejeter la proposal');
  }
  return (await response.json()) as Proposal;
}

export async function rollbackProposal(
  workspaceId: string,
  proposalId: string,
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/rollback`,
    {},
  );
  if (!response.ok) {
    throw await parseApiError(response, 'Impossible de rollback la proposal');
  }
  return (await response.json()) as Proposal;
}

export async function fetchProposalExplanation(
  workspaceId: string,
  proposalId: string,
): Promise<ProposalExplanation> {
  const response = await apiGet(
    `workspaces/${workspaceId}/proposals/${proposalId}/explain`,
  );
  if (!response.ok) {
    throw await parseApiError(
      response,
      "Impossible de charger l'explication",
    );
  }
  return (await response.json()) as ProposalExplanation;
}
