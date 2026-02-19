import { apiPost } from '@/lib/api-client';

// --- Types ---

export type AgentMode = 'chat' | 'command';

export type AgentCommandAlternative = {
  alternativeNo: number;
  summary: string;
  confidenceScore: number;
  actions: Array<Record<string, unknown>>;
};

export type AgentCommandResponse = {
  workspaceId: string;
  correlationId: string;
  proposalId: string;
  proposalStatus: string;
  mode: 'command';
  alternatives: AgentCommandAlternative[];
  deprecationWarning?: string;
};

export type AgentChatResponse = {
  workspaceId: string;
  correlationId: string;
  answer: string;
  suggestedCommandPayload?: {
    intent: string;
    context?: Record<string, unknown>;
  };
};

// --- API calls ---

async function parseAgentError(
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

export async function sendAgentCommand(
  workspaceId: string,
  intent: string,
): Promise<AgentCommandResponse> {
  const response = await apiPost(
    `workspaces/${workspaceId}/agent/command`,
    { intent },
  );
  if (!response.ok) {
    throw await parseAgentError(response, "Impossible d'executer la commande");
  }
  return (await response.json()) as AgentCommandResponse;
}

export async function sendAgentChat(
  workspaceId: string,
  message: string,
): Promise<AgentChatResponse> {
  const response = await apiPost(
    `workspaces/${workspaceId}/agent/chat`,
    { message },
  );
  if (!response.ok) {
    throw await parseAgentError(response, "Impossible d'envoyer le message");
  }
  return (await response.json()) as AgentChatResponse;
}
