"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchTeams, bootstrapTeams, type Team, type BootstrapTeamResponse } from "@/features/teams/teams-api";
import { useTranslation } from "@/i18n";

export default function Home() {
  const { user, accessToken, initializing, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapTeamResponse | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [teamsResolved, setTeamsResolved] = useState(false);
  const bootstrapAttemptedRef = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      setTeams([]);
      setError(null);
      setLoadingTeams(false);
      setBootstrapping(false);
      setTeamsResolved(false);
      bootstrapAttemptedRef.current = false;
      return;
    }

    let cancelled = false;
    setTeamsResolved(false);

    const loadTeams = async () => {
      try {
        setLoadingTeams(true);
        setError(null);
        const response = await fetchTeams(accessToken);
        if (cancelled) return;
        setTeams(response);
        if (response.length === 0 && !bootstrapAttemptedRef.current) {
          bootstrapAttemptedRef.current = true;
          setBootstrapping(true);
          try {
            const boot = await bootstrapTeams(accessToken);
            setBootstrapResult(boot);
            if (cancelled) return;
            const again = await fetchTeams(accessToken);
            if (!cancelled) {
              setTeams(again);
            }
          } catch (err) {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : String(err);
              // If API reports unauthenticated, force logout to clear state and show login
              if (message === 'Non authentifie') {
                void logout();
                return;
              }
              setError(message);
            }
          } finally {
            if (!cancelled) {
              setBootstrapping(false);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
          setTeamsResolved(true);
        }
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, [accessToken, logout]);

  const hasTeams = teams.length > 0;

  useEffect(() => {
    if (!user) return;
    // Redirect as soon as we have both teamId & boardId from bootstrap
    if (bootstrapResult?.boardId && bootstrapResult?.team?.id) {
      router.replace(`/boards/${bootstrapResult.team.id}/${bootstrapResult.boardId}`);
      return;
    }
    // Fallback: if user already has teams (e.g. existed before reload), go to /boards/{teamId}
    // The BoardDataProvider will fetch the root board and set activeBoardId.
    if (teams.length > 0) {
      router.replace(`/boards/${teams[0].id}`);
    }
  }, [user, bootstrapResult, teams, router]);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-muted">{t("common.loading")}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="text-4xl font-semibold">{t("home.guest.title")}</h1>
        <p className="max-w-xl text-balance text-muted">{t("home.guest.subtitle")}</p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-background transition hover:bg-accent-strong"
        >
          {t("home.guest.cta")}
        </Link>
      </div>
    );
  }

  if (hasTeams) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
  <span className="text-sm text-muted">{t("home.redirecting")}</span>
      </div>
    );
  }

  const isResolvingTeams = loadingTeams || bootstrapping || !teamsResolved;

  if (user && isResolvingTeams) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
        <span className="text-sm text-muted">{t("home.loadingTeams")}</span>
      </div>
    );
  }

  const handleManualBootstrap = async () => {
    if (!accessToken) return;
    setBootstrapping(true);
    setError(null);
    try {
  const boot = await bootstrapTeams(accessToken);
  setBootstrapResult(boot);
      bootstrapAttemptedRef.current = true;
      const again = await fetchTeams(accessToken);
      setTeams(again);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Non authentifie') {
        void logout();
        return;
      }
      setError(message);
    } finally {
      setBootstrapping(false);
      setTeamsResolved(true);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      {error ? (
        <div className="max-w-md rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      <p className="text-sm text-muted">
        {bootstrapping || loadingTeams
          ? t("home.bootstrapping")
          : t("home.waitingForTeams")}
      </p>
      <button
        type="button"
        onClick={handleManualBootstrap}
        disabled={bootstrapping || loadingTeams}
        className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {bootstrapping
          ? t("home.bootstrappingAction")
          : t("home.bootstrapCta")}
      </button>
      <div className="flex items-center gap-3 text-xs text-muted">
        <Link href="/settings" className="underline-offset-2 hover:underline">
          {t("common.actions.settings")}
        </Link>
        <button
          type="button"
          onClick={() => void logout()}
          className="underline-offset-2 hover:underline"
        >
          {t("common.actions.signOut")}
        </button>
      </div>
    </div>
  );
}
