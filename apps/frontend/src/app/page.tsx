"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchTeams, bootstrapTeams, type Team } from "@/features/teams/teams-api";

export default function Home() {
  const { user, accessToken, initializing, logout } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapTried, setBootstrapTried] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      setTeams([]);
      setLoadingTeams(false);
      return;
    }

    let cancelled = false;

    async function loadTeams() {
      if (!accessToken) return;
      try {
        setLoadingTeams(true);
        setError(null);
        const response = await fetchTeams(accessToken!);
        if (!cancelled) {
          setTeams(response);
        }
        // Auto-bootstrap si aucune team
        if (!cancelled && response.length === 0 && !bootstrapTried) {
          setBootstrapping(true);
          try {
            await bootstrapTeams(accessToken!);
            setBootstrapTried(true);
            const again = await fetchTeams(accessToken!);
            if (!cancelled) setTeams(again);
          } catch (e) {
            if (!cancelled) {
              setError((e as Error).message + ' (bootstrap)');
            }
          } finally {
            if (!cancelled) setBootstrapping(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoadingTeams(false);
        }
      }
    }

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [accessToken, bootstrapTried]);

  const hasTeams = teams.length > 0;

  const lastUpdated = useMemo(() => {
    if (!hasTeams) return null;
    const [first] = teams;
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(first.createdAt));
  }, [hasTeams, teams]);

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-muted">Initialisation...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 text-center px-6">
        <h1 className="text-4xl font-semibold">Bienvenue sur Stratum</h1>
        <p className="max-w-xl text-balance text-muted">
          Connectez-vous pour acceder a vos equipes, a vos tableaux fractals et a la navigation breadcrumb.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-medium text-background transition hover:bg-accent-strong"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-white/5 bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-accent">Stratum</p>
            <h1 className="text-2xl font-semibold">Bonjour {user.displayName}</h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground"
          >
            Deconnexion
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Vos equipes</h2>
            {lastUpdated ? (
              <span className="text-xs uppercase tracking-wide text-muted">
                Derniere creation : {lastUpdated}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted max-w-2xl">
            Les equipes actives sont synchronisees avec le module Prisma du backend. Selectionnez-en une pour ouvrir le tableau fractal correspondant.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {loadingTeams && !hasTeams ? <SkeletonBoardCard /> : null}

          {!loadingTeams && !hasTeams ? (
            <EmptyState
              manualBootstrap={async () => {
                if (!accessToken) return;
                setBootstrapping(true);
                setError(null);
                try {
                  await bootstrapTeams(accessToken!);
                  const again = await fetchTeams(accessToken!);
                  setTeams(again);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBootstrapping(false);
                }
              }}
              disabled={bootstrapping}
              showManual={bootstrapTried}
            />
          ) : null}

          {teams.map((team) => (
            <article
              key={team.id}
              className="group rounded-2xl border border-white/10 bg-card/70 p-6 shadow-md transition hover:border-accent hover:shadow-accent/20"
            >
              <h3 className="text-lg font-semibold">{team.name}</h3>
              <p className="text-sm text-muted">{team.membersCount} membre(s) actifs</p>
              <p className="mt-2 text-xs text-muted">Creee le {formatFrenchDate(team.createdAt)}</p>
              <Link
                href={`/boards/${team.id}`}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-accent transition hover:text-accent-strong"
              >
                Ouvrir le board
                <span aria-hidden="true">-&gt;</span>
              </Link>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function formatFrenchDate(input: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(input));
}

function SkeletonBoardCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-white/5 bg-card/40 p-6">
      <div className="h-6 w-2/3 rounded bg-white/10" />
      <div className="mt-4 h-4 w-1/2 rounded bg-white/5" />
      <div className="mt-8 h-4 w-1/3 rounded bg-white/5" />
    </div>
  );
}

function EmptyState({ manualBootstrap, disabled, showManual }: { manualBootstrap?: ()=>Promise<void>; disabled?: boolean; showManual?: boolean; }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-card/60 p-8 text-center space-y-4">
      <div>
        <p className="text-lg font-semibold">Aucune equipe pour le moment</p>
        <p className="mt-2 text-sm text-muted">
          Votre espace initial n&apos;existe pas encore. Nous pouvons le créer automatiquement.
        </p>
      </div>
      {showManual && manualBootstrap ? (
        <button
          onClick={manualBootstrap}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-background disabled:opacity-50 hover:bg-accent-strong transition"
        >
          {disabled ? 'Création en cours...' : 'Créer mon premier espace'}
        </button>
      ) : null}
      {!showManual && (
        <p className="text-[11px] text-muted/70">Initialisation automatique en cours...</p>
      )}
    </div>
  );
}





