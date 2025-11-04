const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export type DashboardKind = "EXECUTION" | "PROGRESS" | "RISK";
export type DashboardMode = "SELF" | "AGGREGATED" | "COMPARISON";

export type DashboardWidgetStatus =
  | "ok"
  | "no-data"
  | "insufficient-coverage"
  | "insufficient-history";

export interface DashboardWidgetEntry {
  id: string;
  label: string;
  description: string;
  status: DashboardWidgetStatus;
  payload: unknown;
  reason?: string;
  meta?: Record<string, unknown> | null;
  durationMs: number;
}

export interface DashboardResponse {
  dashboard: DashboardKind;
  mode: DashboardMode;
  nodeId?: string | null;
  generatedAt: string;
  datasetRefreshedAt: string | null;
  widgets: DashboardWidgetEntry[];
  hiddenWidgets: DashboardWidgetEntry[];
  metadata: {
    totalDurationMs: number;
    widgetDurations: Record<string, number>;
    taskCount: number;
    boardIds: string[];
  };
}

export interface FetchDashboardInput {
  dashboard: DashboardKind;
  mode: DashboardMode;
  boardId: string;
  accessToken: string;
  locale: string;
  signal?: AbortSignal;
}

function createOptions(accessToken: string, locale: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept-Language", locale);

  return {
    ...init,
    headers,
    cache: "no-store",
  } satisfies RequestInit;
}

export async function fetchDashboard({
  dashboard,
  mode,
  boardId,
  accessToken,
  locale,
  signal,
}: FetchDashboardInput): Promise<DashboardResponse> {
  const params = new URLSearchParams({
    boardId,
    mode,
  });
  if (locale) {
    params.set("locale", locale);
  }

  const response = await fetch(
    `${API_BASE_URL}/dashboards/${dashboard.toLowerCase()}?${params.toString()}`,
    createOptions(accessToken, locale, { signal }),
  );

  if (!response.ok) {
    const message = await safeErrorMessage(response);
    throw new Error(message ?? "Impossible de charger le tableau de bord");
  }

  const payload = (await response.json()) as DashboardResponse;
  return {
    ...payload,
    datasetRefreshedAt: payload.datasetRefreshedAt ?? null,
    hiddenWidgets: payload.hiddenWidgets ?? [],
    widgets: payload.widgets ?? [],
  };
}

async function safeErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as { message?: string };
    return typeof data?.message === "string" ? data.message : null;
  } catch {
    return null;
  }
}
