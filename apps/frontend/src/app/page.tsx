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

  const isResolvingTeams =
    teamsQuery.isLoading ||
    teamsQuery.isFetching ||
    bootstrapMutation.isPending ||
    (!teamsQuery.isSuccess && !teamsQuery.isError);

  if (user && isResolvingTeams) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface">
        <span className="text-sm text-muted">{t("home.loadingTeams")}</span>
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      {error ? (
        <div className="max-w-md rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
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
        className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
  );
}
