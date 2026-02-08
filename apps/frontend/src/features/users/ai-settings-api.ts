import { apiGet, apiPatch } from "@/lib/api-client";

export type AiSettings = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  timeoutMs: number | null;
  hasApiKey: boolean;
  updatedAt: string | null;
};

export type UpdateAiSettingsInput = {
  provider?: string;
  model?: string | null;
  baseUrl?: string | null;
  timeoutMs?: number | null;
  apiKey?: string | null;
};

export async function fetchAiSettings(): Promise<AiSettings> {
  const response = await apiGet("users/me/ai-settings", { cache: "no-store" });
  if (!response.ok) {
    throw await parseAiSettingsError(response, "Impossible de charger les paramètres IA");
  }
  return (await response.json()) as AiSettings;
}

export async function updateAiSettings(
  input: UpdateAiSettingsInput,
): Promise<AiSettings> {
  const response = await apiPatch("users/me/ai-settings", input);
  if (!response.ok) {
    throw await parseAiSettingsError(response, "Impossible de sauvegarder les paramètres IA");
  }
  return (await response.json()) as AiSettings;
}

async function parseAiSettingsError(
  response: Response,
  fallback: string,
): Promise<Error> {
  try {
    const payload = (await response.json()) as { message?: string; error?: string };
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
