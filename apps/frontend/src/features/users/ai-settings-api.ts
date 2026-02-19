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

// ── Model Catalog types ─────────────────────────────────────────────

export type AiFeature =
  | "proposals"
  | "chat"
  | "embeddings"
  | "summarization"
  | "briefs";

export type ModelTier = "budget" | "balanced" | "premium";

export type ModelEntry = {
  provider: string;
  modelId: string;
  displayName: string;
  tier: ModelTier;
  costPer1MInput: number;
  costPer1MOutput: number;
  costPer1MEmbedding?: number;
  contextWindow: number;
  qualityRating: number;
  speedRating: number;
  recommendedFor: AiFeature[];
  advice: string;
};

export type FeatureGuide = {
  feature: AiFeature;
  label: string;
  description: string;
  recommendedModelId: string;
  requiredCapabilities: string[];
};

export type ModelCatalog = {
  models: ModelEntry[];
  featureGuides: FeatureGuide[];
  catalogVersion: string;
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

// ── Model Catalog fetch ─────────────────────────────────────────────

export async function fetchModelCatalog(): Promise<ModelCatalog> {
  const response = await apiGet("ai/model-catalog", { cache: "no-store" });
  if (!response.ok) {
    throw await parseAiSettingsError(
      response,
      "Impossible de charger le catalogue de modèles IA",
    );
  }
  return (await response.json()) as ModelCatalog;
}
