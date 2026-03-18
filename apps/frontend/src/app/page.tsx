"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchTeams, bootstrapTeams, type Team, type BootstrapTeamResponse } from "@/features/teams/teams-api";
import { useTranslation } from "@/i18n";

export default function Home() {
  const { user, accessToken, initializing, logout } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bootstrapResult, setBootstrapResult] = useState<BootstrapTeamResponse | null>(null);
  const bootstrapAttemptedRef = useRef(false);

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => fetchTeams(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapTeams(accessToken!),
    onSuccess: (boot) => {
      setBootstrapResult(boot);
      void queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Non authentifie") {
        void logout();
      }
    },
  });

  const teams = useMemo<Team[]>(() => teamsQuery.data ?? [], [teamsQuery.data]);

  useEffect(() => {
    if (!accessToken) {
      bootstrapAttemptedRef.current = false;
      setBootstrapResult(null);
      return;
    }
  }, [accessToken, logout]);

  useEffect(() => {
    if (!accessToken) return;
    if (!teamsQuery.isSuccess) return;
    if (teams.length > 0) return;
    if (bootstrapAttemptedRef.current) return;
    if (bootstrapMutation.isPending) return;
    bootstrapAttemptedRef.current = true;
    bootstrapMutation.mutate();
  }, [accessToken, teamsQuery.isSuccess, teams, bootstrapMutation]);

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

  const error = useMemo(() => {
    const err = bootstrapMutation.error ?? teamsQuery.error;
    if (!err) return null;
    return err instanceof Error ? err.message : String(err);
  }, [bootstrapMutation.error, teamsQuery.error]);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="app-panel-strong rounded-[1.8rem] px-6 py-5 text-center">
          <span className="text-muted">{t("common.loading")}</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="app-panel-strong flex w-full max-w-4xl flex-col gap-8 rounded-[2rem] px-8 py-10 text-center md:px-12 md:py-12">
          <div className="space-y-4">
            <p className="app-kicker">Stratum</p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">{t("home.guest.title")}</h1>
            <p className="mx-auto max-w-2xl text-balance text-base text-muted md:text-lg">{t("home.guest.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full px-6 py-3 text-sm font-semibold transition"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-foreground)" }}
            >
              {t("home.guest.cta")}
            </Link>
            <Link href="/register" className="app-pill rounded-full px-6 py-3 text-sm font-semibold text-foreground">
              {t("register.title")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (hasTeams) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <div className="app-panel rounded-[1.4rem] px-5 py-4 text-center">
          <span className="text-sm text-muted">{t("home.redirecting")}</span>
        </div>
      </div>
    );
  }

  const isResolvingTeams =
    teamsQuery.isLoading ||
    teamsQuery.isFetching ||
    bootstrapMutation.isPending ||
    (!teamsQuery.isSuccess && !teamsQuery.isError);

  if (user && isResolvingTeams) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
        <div className="app-panel rounded-[1.4rem] px-5 py-4 text-center">
          <span className="text-sm text-muted">{t("home.loadingTeams")}</span>
        </div>
      </div>
    );
  }

  const handleManualBootstrap = async () => {
    if (!accessToken) return;
    try {
      bootstrapMutation.reset();
      const boot = await bootstrapMutation.mutateAsync();
      setBootstrapResult(boot);
      bootstrapAttemptedRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Non authentifie') {
        void logout();
        return;
      }
    } finally {
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="app-panel-strong flex w-full max-w-2xl flex-col items-center gap-5 rounded-[1.8rem] px-8 py-8 text-center">
        {error ? (
          <div className="app-danger-panel max-w-md rounded-xl px-4 py-3 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </div>
        ) : null}
        <p className="text-sm text-muted">
          {bootstrapMutation.isPending || teamsQuery.isLoading
            ? t("home.bootstrapping")
            : t("home.waitingForTeams")}
        </p>
        <button
          type="button"
          onClick={handleManualBootstrap}
          disabled={bootstrapMutation.isPending || teamsQuery.isLoading}
          className="app-pill rounded-full px-4 py-2 text-sm font-medium text-muted transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {bootstrapMutation.isPending
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
    </div>
  );
}
