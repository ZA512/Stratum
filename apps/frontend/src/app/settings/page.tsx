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
import { useTheme, ThemeProvider } from "@/themes/theme-provider";
import type { ThemeDefinition } from "@/themes";
import { exportTestData, importTestData } from "@/features/test-data/test-data-api";

export default function SettingsPage() {
  const { t, locale, availableLocales, setLocale } = useTranslation();
  const { accessToken } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [raciTeams, setRaciTeams] = useState<RaciTeamPreset[]>([]);
  const [raciTeamsLoading, setRaciTeamsLoading] = useState(false);
  const [raciTeamsError, setRaciTeamsError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // Fallback: si hook lève une erreur (provider absent), on encapsule dynamiquement.
  let content: React.ReactNode = (
    <div className="min-h-screen bg-surface px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
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
