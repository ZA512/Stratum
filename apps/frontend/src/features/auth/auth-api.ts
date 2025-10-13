// Resolve NEXT_PUBLIC_API_URL defensively: ignore empty strings and trim whitespace.
const rawPublicUrl = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_API_URL : undefined;
const trimmed = rawPublicUrl ? rawPublicUrl.trim() : "";
const DEFAULT_API = `http://localhost:${process.env.BACKEND_PORT ?? 4001}/api/v1`;
const API_BASE_URL = trimmed.length > 0 ? trimmed : DEFAULT_API;

// Debug: show which base URL the frontend uses for API calls (helps troubleshooting builds/runtime)
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.debug("auth-api: NEXT_PUBLIC_API_URL raw=", rawPublicUrl, " resolved API_BASE_URL=", API_BASE_URL);
}

type LoginResponse = {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
};

export async function registerRequest(input: RegisterInput): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await safeParseError(response);
    const message = payload?.message ?? "Impossible de créer le compte";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  // Certains environnements renvoient un corps vide après l'inscription.
  // On ne force donc pas la lecture du payload et on se contente du statut HTTP.
}

export async function loginRequest(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const payload = await safeParseError(response);
    const message = payload?.message ?? "Echec de l'authentification";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as LoginResponse;
}

export type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

export async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    const payload = await safeParseError(response);
    const message = payload?.message ?? "Impossible de rafraîchir la session";
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as RefreshResponse;
}

type ErrorPayload = {
  message?: string;
  error?: string;
};

async function safeParseError(response: Response): Promise<ErrorPayload | null> {
  try {
    return (await response.json()) as ErrorPayload;
  } catch {
    return null;
  }
}


