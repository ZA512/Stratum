"use client";

export const dynamic = 'force-dynamic';

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
  const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
      if (next && next.startsWith('/')) {
        router.replace(next);
      } else {
        router.replace('/');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card/80 p-8 shadow-xl backdrop-blur">
        <div className="mb-6 space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-accent">Stratum</p>
          <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
          <p className="text-sm text-muted">{t("login.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("login.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder="votre@email.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("login.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder="********"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-accent px-4 py-3 text-sm font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"
          >
            {isSubmitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <div className="mt-8 space-y-3 text-center text-sm text-muted">
          <p>
            <span>{t("login.backPrompt")}</span>{" "}
            <Link href="/" className="text-accent hover:text-accent-strong">
              {t("login.backLink")}
            </Link>
          </p>
          <p>
            <span>{t("login.noAccount")}</span>{" "}
            <Link href="/register" className="text-accent hover:text-accent-strong">
              {t("login.createAccount")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
