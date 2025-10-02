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

export default function SettingsPage() {
  const { t, locale, availableLocales, setLocale } = useTranslation();
  const { accessToken } = useAuth();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [raciTeams, setRaciTeams] = useState<RaciTeamPreset[]>([]);
  const [raciTeamsLoading, setRaciTeamsLoading] = useState(false);
  const [raciTeamsError, setRaciTeamsError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  return (
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
      </div>
    </div>
  );
}
