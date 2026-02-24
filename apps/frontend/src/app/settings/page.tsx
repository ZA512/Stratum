"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation, type Locale } from "@/i18n";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteRaciTeam,
  fetchRaciTeams,
  renameRaciTeam,
  type RaciTeamPreset,
} from "@/features/users/raci-teams-api";
import {
  fetchAiSettings,
  updateAiSettings,
  fetchModelCatalog,
  type AiSettings,
  type ModelCatalog,
  type ModelEntry,
} from "@/features/users/ai-settings-api";
import { useTheme, ThemeProvider } from "@/themes/theme-provider";
import type { ThemeDefinition } from "@/themes";
import { exportTestData, importTestData } from "@/features/test-data/test-data-api";

type SettingsTab = "appearance" | "ai" | "raciTeams" | "data";

export default function SettingsPage() {
  const { t, locale, availableLocales, setLocale } = useTranslation();
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [raciTeams, setRaciTeams] = useState<RaciTeamPreset[]>([]);
  const [raciTeamsLoading, setRaciTeamsLoading] = useState(false);
  const [raciTeamsError, setRaciTeamsError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState("heuristic");
  const [aiModel, setAiModel] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiTimeoutMs, setAiTimeoutMs] = useState("");
  const [aiApiKeyInput, setAiApiKeyInput] = useState("");
  const [aiClearApiKey, setAiClearApiKey] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogTarget, setCatalogTarget] = useState<"llm" | "embedding">("llm");
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogFilter, setCatalogFilter] = useState<string>("all");
  const [testDataMessage, setTestDataMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const { activeThemeId, themes: availableThemes, setTheme } = useTheme();

  const handleThemeSelect = useCallback(
    (theme: ThemeDefinition) => {
      if (theme.id === activeThemeId) return;
      setTheme(theme.id);
      setFeedback(t("settings.theme.applied", { theme: t(theme.nameKey) }));
    },
    [activeThemeId, setTheme, setFeedback, t],
  );

  const sortRaciTeams = useCallback(
    (teams: RaciTeamPreset[]) =>
      [...teams].sort((a, b) =>
        a.name.localeCompare(b.name, locale === "fr" ? "fr" : "en", {
          sensitivity: "base",
        }),
      ),
    [locale],
  );

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const languageOptions = useMemo(
    () =>
      availableLocales.map((value) => ({
        value,
        label: value === "en" ? t("common.language.english") : t("common.language.french"),
      })),
    [availableLocales, t],
  );

  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as Locale;
    if (next === locale) return;
    setLocale(next);
    setFeedback(t("settings.success"));
  };

  useEffect(() => {
    if (!accessToken) {
      setRaciTeams([]);
      return;
    }
    let cancelled = false;
    setRaciTeamsLoading(true);
    setRaciTeamsError(null);
    fetchRaciTeams(accessToken)
      .then((teams) => {
        if (cancelled) return;
        setRaciTeams(sortRaciTeams(teams));
      })
      .catch((error) => {
        if (cancelled) return;
        setRaciTeamsError(
          error instanceof Error
            ? error.message
            : t("settings.raciTeams.loadError"),
        );
        setRaciTeams([]);
      })
      .finally(() => {
        if (!cancelled) setRaciTeamsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, sortRaciTeams, t]);

  useEffect(() => {
    if (!accessToken) {
      setAiSettings(null);
      return;
    }
    let cancelled = false;
    setAiSettingsLoading(true);
    setAiSettingsError(null);
    fetchAiSettings()
      .then((settings) => {
        if (cancelled) return;
        setAiSettings(settings);
        setAiEnabled(settings.aiEnabled ?? false);
        setAiProvider(settings.provider || "heuristic");
        setAiModel(settings.model ?? "");
        setAiBaseUrl(settings.baseUrl ?? "");
        setAiTimeoutMs(settings.timeoutMs ? String(settings.timeoutMs) : "");
        setAiApiKeyInput("");
        setAiClearApiKey(false);
        setEmbeddingProvider(settings.embeddingProvider ?? "");
        setEmbeddingModel(settings.embeddingModel ?? "");
      })
      .catch((error) => {
        if (cancelled) return;
        setAiSettingsError(
          error instanceof Error
            ? error.message
            : t("settings.ai.loadError"),
        );
      })
      .finally(() => {
        if (!cancelled) setAiSettingsLoading(false);
      });
    fetchModelCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((error) => {
        if (!cancelled)
          setCatalogError(
            error instanceof Error ? error.message : t("settings.ai.catalog.loadError"),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  const handleRenameTeam = (team: RaciTeamPreset) => {
    if (!accessToken) return;
    const promptLabel = t("settings.raciTeams.renamePrompt", { name: team.name });
    const nextName = window.prompt(promptLabel, team.name);
    if (nextName === null) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === team.name) return;
    setRenamingId(team.id);
    renameRaciTeam(team.id, trimmed, accessToken)
      .then((updated) => {
        setRaciTeams((prev) =>
          sortRaciTeams(
            prev.map((entry) => (entry.id === team.id ? updated : entry)),
          ),
        );
        setFeedback(t("settings.raciTeams.renameSuccess"));
        setRaciTeamsError(null);
      })
      .catch(() => {
        setRaciTeamsError(t("settings.raciTeams.renameError"));
      })
      .finally(() => {
        setRenamingId(null);
      });
  };

  const handleDeleteTeam = (team: RaciTeamPreset) => {
    if (!accessToken) return;
    const confirmation = t("settings.raciTeams.deleteConfirm", { name: team.name });
    if (!window.confirm(confirmation)) return;
    setDeletingId(team.id);
    deleteRaciTeam(team.id, accessToken)
      .then(() => {
        setRaciTeams((prev) =>
          sortRaciTeams(prev.filter((entry) => entry.id !== team.id)),
        );
        setFeedback(t("settings.raciTeams.deleteSuccess"));
        setRaciTeamsError(null);
      })
      .catch(() => {
        setRaciTeamsError(t("settings.raciTeams.deleteError"));
      })
      .finally(() => {
        setDeletingId(null);
      });
  };

  const handleExportTestData = async () => {
    if (!accessToken || exporting || importing) return;
    setExporting(true);
    setTestDataMessage(null);
    try {
      const { blob, filename } = await exportTestData(accessToken);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename ?? `stratum-export-${new Date().toISOString().slice(0, 10)}.dump`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setTestDataMessage({ type: "success", text: t("settings.testData.exportSuccess") });
    } catch {
      setTestDataMessage({ type: "error", text: t("settings.testData.error") });
    } finally {
      setExporting(false);
    }
  };

  const handleImportTestData = async () => {
    if (!accessToken || exporting || importing) return;
    if (!importFile) {
      setTestDataMessage({ type: "error", text: t("settings.testData.noFile") });
      return;
    }
    const confirmation = window.confirm(t("settings.testData.importConfirm"));
    if (!confirmation) return;
    setImporting(true);
    setTestDataMessage(null);
    try {
      await importTestData(importFile, accessToken);
      setTestDataMessage({ type: "success", text: t("settings.testData.importSuccess") });
      setImportFile(null);
    } catch {
      setTestDataMessage({ type: "error", text: t("settings.testData.error") });
    } finally {
      setImporting(false);
    }
  };

  const aiProviderOptions = useMemo(
    () => [
      { value: "heuristic", label: t("settings.ai.providers.heuristic") },
      { value: "openai", label: t("settings.ai.providers.openai") },
      { value: "anthropic", label: t("settings.ai.providers.anthropic") },
      { value: "mistral", label: t("settings.ai.providers.mistral") },
      { value: "gemini", label: t("settings.ai.providers.gemini") },
      { value: "ollama", label: t("settings.ai.providers.ollama") },
      { value: "custom", label: t("settings.ai.providers.custom") },
    ],
    [t],
  );

  // Providers disponibles quand l'IA est activée (heuristic exclu)
  const activeProviderOptions = useMemo(
    () => aiProviderOptions.filter((o) => o.value !== "heuristic"),
    [aiProviderOptions],
  );

  const handleAiSave = async () => {
    if (!accessToken || aiSaving) return;
    setAiSaving(true);
    setAiSettingsError(null);
    try {
      const timeoutRaw = aiTimeoutMs.trim();
      const timeoutValue = timeoutRaw ? Number(timeoutRaw) : null;
      if (timeoutRaw && !Number.isFinite(timeoutValue)) {
        setAiSettingsError(t("settings.ai.saveError"));
        return;
      }
      const payload: Parameters<typeof updateAiSettings>[0] = {
        aiEnabled,
        provider: aiProvider,
        model: aiModel.trim() ? aiModel.trim() : null,
        baseUrl: aiBaseUrl.trim() ? aiBaseUrl.trim() : null,
        timeoutMs: timeoutValue,
        // L'embedding utilise le même provider que le LLM (même connexion)
        embeddingProvider: embeddingModel.trim() && aiProvider !== "heuristic" ? aiProvider : null,
        embeddingModel: embeddingModel.trim() ? embeddingModel.trim() : null,
      };

      if (aiClearApiKey) {
        payload.apiKey = null;
      } else if (aiApiKeyInput.trim()) {
        payload.apiKey = aiApiKeyInput.trim();
      }

      const saved = await updateAiSettings(payload);
      setAiSettings(saved);
      setAiApiKeyInput("");
      setAiClearApiKey(false);
      setFeedback(t("settings.ai.saved"));
    } catch (error) {
      setAiSettingsError(
        error instanceof Error ? error.message : t("settings.ai.saveError"),
      );
    } finally {
      setAiSaving(false);
    }
  };

  // Fallback: si hook lève une erreur (provider absent), on encapsule dynamiquement.
  const TABS: { id: SettingsTab; label: string }[] = [
    { id: "appearance", label: t("settings.tabs.appearance") },
    { id: "ai", label: t("settings.tabs.ai") },
    { id: "raciTeams", label: t("settings.tabs.raciTeams") },
    { id: "data", label: t("settings.tabs.data") },
  ];

  let content: React.ReactNode = (
    <div className="min-h-screen bg-surface px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">{t("settings.title")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">{t("settings.description")}</p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
          >
            {t("settings.back")}
          </Link>
        </div>

        {feedback ? (
          <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">
            {feedback}
          </div>
        ) : null}

        {/* ── Onglets ────────────────────────────────────────── */}
        <div className="flex gap-1 rounded-2xl border border-white/10 bg-card/50 p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-accent/20 text-accent shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Contenu des onglets ────────────────────────────── */}

        {activeTab === "appearance" && (
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-white/10 bg-card/70 p-6 shadow-md">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.theme.title")}</h2>
              <p className="mt-2 text-sm text-muted">{t("settings.theme.description")}</p>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {availableThemes.map((theme) => {
                  const isActive = theme.id === activeThemeId;
                  const toneLabel = t(`settings.theme.tone.${theme.tone}`);
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => handleThemeSelect(theme)}
                      className={`group relative flex h-full flex-col gap-4 rounded-2xl border px-4 py-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        isActive
                          ? "border-accent/60 bg-accent/10 text-foreground shadow-lg"
                          : "border-white/15 bg-surface/70 text-foreground hover:border-accent/40 hover:bg-surface"
                      }`}
                      aria-pressed={isActive}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{t(theme.nameKey)}</p>
                          <p className="mt-1 text-xs text-muted">{t(theme.descriptionKey)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                            {toneLabel}
                          </span>
                          {isActive ? (
                            <span className="text-[11px] font-semibold text-accent">{t("settings.theme.active")}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span
                          className="h-12 flex-1 rounded-xl border border-white/10 shadow-sm"
                          style={{ backgroundColor: theme.preview.background }}
                          aria-hidden
                        />
                        <span
                          className="h-12 flex-1 rounded-xl border border-white/10 shadow-sm"
                          style={{ backgroundColor: theme.preview.surface }}
                          aria-hidden
                        />
                        <span
                          className="h-12 flex-1 rounded-xl border border-white/10 shadow-sm"
                          style={{ backgroundColor: theme.preview.card }}
                          aria-hidden
                        />
                        <span
                          className="h-12 w-12 rounded-xl border border-white/10 shadow-sm"
                          style={{ backgroundColor: theme.preview.accent }}
                          aria-hidden
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-card/70 p-6 shadow-md">
              <h2 className="text-lg font-semibold text-foreground">{t("settings.languageLabel")}</h2>
              <p className="mt-2 text-sm text-muted">{t("settings.languageHelp")}</p>

              <div className="mt-6">
                <label className="block text-sm text-muted">
                  <span className="mb-2 block font-medium text-foreground">{t("common.language.label")}</span>
                    <select
                    className="w-full rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                    value={locale}
                    onChange={handleLanguageChange}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          </div>
        )}

        {activeTab === "ai" && (
          <section className="rounded-2xl border border-white/10 bg-card/70 p-6 shadow-md">
            <h2 className="text-lg font-semibold text-foreground">{t("settings.ai.title")}</h2>
            <p className="mt-2 text-sm text-muted">{t("settings.ai.description")}</p>

            <div className="mt-4 space-y-4">
              {aiSettingsLoading ? (
                <p className="text-sm text-muted">{t("common.loading")}</p>
              ) : null}

              {aiSettingsError ? (
                <p className="text-sm text-red-500 dark:text-red-400">{aiSettingsError}</p>
              ) : null}

              {/* ── Toggle activation IA ──────────────────────────── */}
              <label className="flex cursor-pointer items-center gap-3">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    disabled={aiSettingsLoading}
                  />
                  <div
                    className={`h-6 w-11 rounded-full transition-colors ${aiEnabled ? "bg-accent" : "bg-white/20"}`}
                  />
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${aiEnabled ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {t("settings.ai.enabledLabel")}
                  </span>
                  <p className="text-xs text-muted">
                    {aiEnabled ? t("settings.ai.enabledHint") : t("settings.ai.disabledHint")}
                  </p>
                </div>
              </label>

              {!aiEnabled ? (
                <div className="rounded-xl border border-white/10 bg-surface/40 px-4 py-3 text-sm text-muted">
                  {t("settings.ai.manualModeInfo")}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* ── Connexion ─────────────────────────────────── */}
                  <div className="space-y-4 rounded-xl border border-white/10 bg-surface/30 p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("settings.ai.connection.title")}
                    </h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.providerLabel")}
                        </span>
                        <select
                          className="w-full rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                          value={aiProvider}
                          onChange={(event) => setAiProvider(event.target.value)}
                          disabled={aiSettingsLoading}
                        >
                          {activeProviderOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-xs text-muted">
                          {t("settings.ai.providerHelp")}
                        </span>
                      </label>

                      <div className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.apiKeyLabel")}
                        </span>
                        <input
                          type="password"
                          className="w-full rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                          value={aiApiKeyInput}
                          onChange={(event) => setAiApiKeyInput(event.target.value)}
                          placeholder={t("settings.ai.apiKeyPlaceholder")}
                          disabled={aiSettingsLoading}
                        />
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted">
                            {aiSettings?.hasApiKey
                              ? t("settings.ai.apiKeySaved")
                              : t("settings.ai.apiKeyHint")}
                          </span>
                          {aiSettings?.hasApiKey && (
                            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-foreground">
                              <input
                                type="checkbox"
                                checked={aiClearApiKey}
                                onChange={(event) => setAiClearApiKey(event.target.checked)}
                                disabled={aiSettingsLoading}
                              />
                              {t("settings.ai.apiKeyClearLabel")}
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.baseUrlLabel")}
                        </span>
                        <input
                          className="w-full rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                          value={aiBaseUrl}
                          onChange={(event) => setAiBaseUrl(event.target.value)}
                          placeholder={
                            aiProvider === "ollama"
                              ? "http://localhost:11434"
                              : "https://api.openai.com/v1"
                          }
                          disabled={aiSettingsLoading}
                        />
                        <span className="mt-1 block text-xs text-muted">
                          {aiProvider === "ollama" || aiProvider === "custom"
                            ? t("settings.ai.baseUrlRequired")
                            : t("settings.ai.baseUrlHint")}
                        </span>
                      </label>

                      <label className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.timeoutLabel")}
                        </span>
                        <input
                          type="number"
                          min={3000}
                          max={120000}
                          className="w-full rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                          value={aiTimeoutMs}
                          onChange={(event) => setAiTimeoutMs(event.target.value)}
                          placeholder="15000"
                          disabled={aiSettingsLoading}
                        />
                        <span className="mt-1 block text-xs text-muted">
                          {t("settings.ai.timeoutHint")}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* ── Modèles ───────────────────────────────────── */}
                  <div className="space-y-4 rounded-xl border border-white/10 bg-surface/30 p-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("settings.ai.models.title")}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        {t("settings.ai.models.description")}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.models.chatLabel")}
                        </span>
                        <div className="flex gap-2">
                          <input
                            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                            value={aiModel}
                            onChange={(event) => setAiModel(event.target.value)}
                            placeholder={t("settings.ai.models.chatPlaceholder")}
                            disabled={aiSettingsLoading}
                          />
                          <button
                            type="button"
                            onClick={() => { setCatalogTarget("llm"); setCatalogOpen(true); }}
                            className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-accent"
                            title={t("settings.ai.catalog.showGuide")}
                          >
                            ☰
                          </button>
                        </div>
                        <span className="mt-1 block text-xs text-muted">
                          {t("settings.ai.models.chatHint")}
                        </span>
                      </label>

                      <label className="block text-sm text-muted">
                        <span className="mb-2 block font-medium text-foreground">
                          {t("settings.ai.models.embeddingLabel")}
                        </span>
                        <div className="flex gap-2">
                          <input
                            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-surface px-4 py-2 text-sm text-foreground outline-none transition focus:border-accent"
                            value={embeddingModel}
                            onChange={(event) => setEmbeddingModel(event.target.value)}
                            placeholder={t("settings.ai.models.embeddingPlaceholder")}
                            disabled={aiSettingsLoading}
                          />
                          <button
                            type="button"
                            onClick={() => { setCatalogTarget("embedding"); setCatalogOpen(true); }}
                            className="shrink-0 rounded-xl border border-white/15 px-3 py-2 text-xs text-muted transition hover:border-accent hover:text-accent"
                            title={t("settings.ai.catalog.showGuide")}
                          >
                            ☰
                          </button>
                        </div>
                        <span className="mt-1 block text-xs text-muted">
                          {t("settings.ai.models.embeddingHint")}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  {aiSettings?.updatedAt
                    ? t("settings.ai.updatedAt", { date: aiSettings.updatedAt })
                    : t("settings.ai.notConfigured")}
                </p>
                <button
                  type="button"
                  onClick={handleAiSave}
                  disabled={!accessToken || aiSettingsLoading || aiSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aiSaving ? t("settings.ai.saving") : t("settings.ai.saveButton")}
                </button>
              </div>

              {/* ── Catalogue de modèles ───────────────────────────── */}
              <div className="border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={() => setCatalogOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-sm font-medium text-accent transition hover:text-foreground"
                >
                  <span>{catalogOpen ? "▾" : "▸"}</span>
                  {catalogOpen
                    ? t("settings.ai.catalog.hideGuide")
                    : t("settings.ai.catalog.showGuide")}
                </button>

                {catalogOpen && (
                  <div className="mt-4 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          {t("settings.ai.catalog.title")}
                        </h3>
                        <p className="mt-1 text-xs text-muted">
                          {t("settings.ai.catalog.description")}
                        </p>
                      </div>
                      {/* Sélecteur de cible */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCatalogTarget("llm")}
                          className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${catalogTarget === "llm" ? "border-accent bg-accent/10 text-accent" : "border-white/15 text-muted hover:border-accent hover:text-accent"}`}
                        >
                          LLM
                        </button>
                        <button
                          type="button"
                          onClick={() => setCatalogTarget("embedding")}
                          className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${catalogTarget === "embedding" ? "border-accent bg-accent/10 text-accent" : "border-white/15 text-muted hover:border-accent hover:text-accent"}`}
                        >
                          Embedding
                        </button>
                      </div>
                    </div>

                    {catalogError ? (
                      <p className="text-sm text-red-500 dark:text-red-400">
                        {catalogError}
                      </p>
                    ) : null}

                    {catalog ? (
                      <>
                        {/* Guides par fonctionnalité (LLM uniquement) */}
                        {catalogTarget === "llm" && (
                          <div className="space-y-3">
                            {catalog.featureGuides.map((guide) => {
                              const recModel = catalog.models.find(
                                (m) => m.modelId === guide.recommendedModelId,
                              );
                              return (
                                <div
                                  key={guide.feature}
                                  className="rounded-xl border border-white/10 bg-surface/60 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">
                                        {t(`settings.ai.catalog.features.${guide.feature}`) || guide.label}
                                      </p>
                                      <p className="mt-1 text-xs text-muted">
                                        {guide.description}
                                      </p>
                                    </div>
                                    {recModel ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAiProvider(recModel.provider);
                                          setAiModel(recModel.modelId);
                                        }}
                                        className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20"
                                      >
                                        {t("settings.ai.catalog.useThisModel")} — {recModel.displayName}
                                      </button>
                                    ) : null}
                                  </div>
                                  {recModel ? (
                                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted">
                                      <span>
                                        {t("settings.ai.catalog.costLabel")}:{" "}
                                        {recModel.costPer1MInput === 0 && recModel.costPer1MOutput === 0 && !recModel.costPer1MEmbedding
                                          ? t("settings.ai.catalog.costFree")
                                          : recModel.costPer1MEmbedding != null
                                            ? `$${recModel.costPer1MEmbedding} ${t("settings.ai.catalog.costEmbedding")}`
                                            : `$${recModel.costPer1MInput} ${t("settings.ai.catalog.costInput")} / $${recModel.costPer1MOutput} ${t("settings.ai.catalog.costOutput")}`}
                                      </span>
                                      <span>
                                        {t("settings.ai.catalog.qualityLabel")}: {"★".repeat(recModel.qualityRating)}{"☆".repeat(5 - recModel.qualityRating)}
                                      </span>
                                      <span>
                                        {t("settings.ai.catalog.speedLabel")}: {"★".repeat(recModel.speedRating)}{"☆".repeat(5 - recModel.speedRating)}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Catalogue complet filtrable */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                              {t("settings.ai.catalog.filterProvider")}
                            </h4>
                            <select
                              className="rounded-lg border border-white/15 bg-surface px-3 py-1 text-xs text-foreground outline-none transition focus:border-accent"
                              value={catalogFilter}
                              onChange={(e) => setCatalogFilter(e.target.value)}
                            >
                              <option value="all">{t("settings.ai.catalog.filterAll")}</option>
                              {[...new Set(
                                catalog.models
                                  .filter((m) =>
                                    catalogTarget === "embedding"
                                      ? m.recommendedFor?.includes("embeddings")
                                      : !m.recommendedFor?.includes("embeddings") || m.recommendedFor.length > 1
                                  )
                                  .map((m) => m.provider)
                              )].map((p) => (
                                <option key={p} value={p}>
                                  {t(`settings.ai.providers.${p}`) || p}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {catalog.models
                              .filter((m) => {
                                const providerMatch = catalogFilter === "all" || m.provider === catalogFilter;
                                const targetMatch =
                                  catalogTarget === "embedding"
                                    ? m.recommendedFor?.includes("embeddings")
                                    : !m.recommendedFor?.includes("embeddings") || (m.recommendedFor?.length ?? 0) > 1;
                                return providerMatch && targetMatch;
                              })
                              .map((model) => (
                                <ModelCard
                                  key={`${model.provider}-${model.modelId}`}
                                  model={model}
                                  t={t}
                                  onSelect={() => {
                                    if (catalogTarget === "embedding") {
                                      setEmbeddingProvider(model.provider);
                                      setEmbeddingModel(model.modelId);
                                    } else {
                                      setAiProvider(model.provider);
                                      setAiModel(model.modelId);
                                    }
                                  }}
                                />
                              ))}
                          </div>

                          <p className="text-[10px] text-muted">
                            {t("settings.ai.catalog.catalogVersion", {
                              version: catalog.catalogVersion,
                            })}
                          </p>
                        </div>
                      </>
                    ) : !catalogError ? (
                      <p className="text-sm text-muted">{t("common.loading")}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === "raciTeams" && (
          <section className="rounded-2xl border border-white/10 bg-card/70 p-6 shadow-md">
            <h2 className="text-lg font-semibold text-foreground">{t("settings.raciTeams.title")}</h2>
            <p className="mt-2 text-sm text-muted">{t("settings.raciTeams.description")}</p>

            <div className="mt-6 space-y-4">
              {raciTeamsLoading ? (
                <p className="text-sm text-muted">{t("settings.raciTeams.loading")}</p>
              ) : null}

              {raciTeamsError ? (
                <p className="text-sm text-red-500 dark:text-red-400">{raciTeamsError}</p>
              ) : null}

              {!raciTeamsLoading && !raciTeamsError && raciTeams.length === 0 ? (
                <p className="text-sm text-muted">{t("settings.raciTeams.empty")}</p>
              ) : null}

              {!raciTeamsLoading && raciTeams.length > 0 ? (
                <ul className="space-y-3">
                  {raciTeams.map((team) => (
                    <li
                      key={team.id}
                      className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-foreground">{team.name}</p>
                        <p className="text-xs text-muted">
                          {t("settings.raciTeams.counts", {
                            r: team.raci.R.length,
                            a: team.raci.A.length,
                            c: team.raci.C.length,
                            i: team.raci.I.length,
                          })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleRenameTeam(team)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={renamingId === team.id || deletingId === team.id}
                        >
                          ✏️ {t("settings.raciTeams.rename")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTeam(team)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:border-red-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                          disabled={deletingId === team.id || renamingId === team.id}
                        >
                          🗑️ {t("settings.raciTeams.delete")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === "data" && (
          <section className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6 shadow-md">
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-red-500">
              {t("settings.testData.warning")}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">{t("settings.testData.title")}</h2>
            <p className="mt-2 text-sm text-muted">{t("settings.testData.description")}</p>

            <div className="mt-4 space-y-3">
              <label className="block text-sm text-muted">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("settings.testData.importLabel")}
                </span>
                <input
                  type="file"
                  accept=".dump,application/octet-stream"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  className="block w-full rounded-xl border border-white/15 bg-surface px-3 py-2 text-sm text-foreground"
                />
                <span className="mt-1 block text-xs text-muted">{t("settings.testData.importHint")}</span>
              </label>
            </div>

            {testDataMessage ? (
              <div
                className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                  testDataMessage.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/40 bg-red-500/10 text-red-400"
                }`}
              >
                {testDataMessage.text}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleExportTestData}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!accessToken || exporting || importing}
              >
                {exporting ? t("settings.testData.exporting") : t("settings.testData.exportButton")}
              </button>
              <button
                type="button"
                onClick={handleImportTestData}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!accessToken || exporting || importing}
              >
                {importing ? t("settings.testData.importing") : t("settings.testData.importButton")}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
  // Si aucune erreur jusqu'ici, le ThemeProvider est présent.
  // Mais par précaution, si activeThemeId est falsy (improbable), on wrap.
  if (!activeThemeId) {
    content = <ThemeProvider>{content}</ThemeProvider>;
  }
  return content;
}

// ── Helper components ──────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  budget: "border-emerald-500/40 text-emerald-400",
  balanced: "border-blue-500/40 text-blue-400",
  premium: "border-amber-500/40 text-amber-400",
};

function ModelCard({
  model,
  t,
  onSelect,
}: {
  model: ModelEntry;
  t: (key: string, params?: Record<string, string>) => string;
  onSelect: () => void;
}) {
  const tierColor = TIER_COLORS[model.tier] ?? "border-white/15 text-muted";
  const isEmbedding = model.costPer1MEmbedding != null;
  const isFree =
    model.costPer1MInput === 0 &&
    model.costPer1MOutput === 0 &&
    (model.costPer1MEmbedding == null || model.costPer1MEmbedding === 0);

  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl border border-white/10 bg-surface/60 p-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {model.displayName}
            </p>
            <p className="text-[11px] text-muted">
              {t(`settings.ai.providers.${model.provider}`) || model.provider}
              {" · "}
              <code className="text-[10px]">{model.modelId}</code>
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierColor}`}
          >
            {t(`settings.ai.catalog.tier.${model.tier}`) || model.tier}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>
            {t("settings.ai.catalog.costLabel")}:{" "}
            {isFree
              ? t("settings.ai.catalog.costFree")
              : isEmbedding
                ? `$${model.costPer1MEmbedding}`
                : `$${model.costPer1MInput} / $${model.costPer1MOutput}`}
          </span>
          <span>
            {t("settings.ai.catalog.contextLabel")}:{" "}
            {model.contextWindow >= 1_000_000
              ? `${(model.contextWindow / 1_000_000).toFixed(1)}M`
              : `${Math.round(model.contextWindow / 1000)}k`}
          </span>
          <span>
            {t("settings.ai.catalog.qualityLabel")}:{" "}
            {"★".repeat(model.qualityRating)}
            {"☆".repeat(5 - model.qualityRating)}
          </span>
          <span>
            {t("settings.ai.catalog.speedLabel")}:{" "}
            {"★".repeat(model.speedRating)}
            {"☆".repeat(5 - model.speedRating)}
          </span>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          {model.advice}
        </p>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="self-start rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent"
      >
        {t("settings.ai.catalog.useThisModel")}
      </button>
    </div>
  );
}
