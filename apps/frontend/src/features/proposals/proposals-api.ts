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
  entityType?: string | null;
  entityId?: string | null;
  payload: Record<string, unknown>;
  actionOrder?: number;
  ordering?: number;
};

export type Proposal = {
  proposalId: string;
  workspaceId: string;
  status: ProposalStatus;
  intent?: string | null;
  confidenceScore?: number | null;
  selectedAlternativeNo?: number | null;
  actions?: ProposalAction[];
  appliedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  explanation?: ProposalExplanation | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProposalExplanation = {
  reasoningSummary: string;
  entitiesImpacted: Array<{
    entityType: string;
    entityId: string;
    action: string;
  }>;
  ragChunkIds: string[];
  confidenceScore: number;
  confidenceLevel: string;
  ruleViolations: string[];
  promptVersion: string;
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
  reason = 'Rejected by user',
): Promise<Proposal> {
  const response = await apiPost(
    `workspaces/${workspaceId}/proposals/${proposalId}/reject`,
    { reason },
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
