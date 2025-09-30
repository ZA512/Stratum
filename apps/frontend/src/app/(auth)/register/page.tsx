"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { registerRequest } from "@/features/auth/auth-api";
import { useTranslation } from "@/i18n";

export default function RegisterPage() {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError(t("register.errors.passwordMismatch"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await registerRequest({ displayName, email, password });
      setSuccess(true);
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
          <h1 className="text-2xl font-semibold">{t("register.title")}</h1>
          <p className="text-sm text-muted">{t("register.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("register.displayName")}</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder={t("register.displayNamePlaceholder")}
              autoComplete="name"
              disabled={isSubmitting || success}
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("register.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder="alice@stratum.dev"
              autoComplete="email"
              disabled={isSubmitting || success}
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("register.password")}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder="********"
              autoComplete="new-password"
              disabled={isSubmitting || success}
              required
            />
          </label>

          <label className="block space-y-2 text-sm">
            <span className="text-muted">{t("register.confirmPassword")}</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-surface px-4 py-2 text-foreground outline-none transition focus:border-accent"
              placeholder="********"
              autoComplete="new-password"
              disabled={isSubmitting || success}
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          ) : null}

          {success ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {t("register.success")}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || success}
            className="w-full rounded-full bg-accent px-4 py-3 text-sm font-semibold text-background transition hover:bg-accent-strong disabled:opacity-60"
          >
            {isSubmitting ? t("register.submitting") : t("register.submit")}
          </button>
        </form>

        <div className="mt-8 space-y-3 text-center text-sm text-muted">
          <p>
            <span>{t("register.backPrompt")}</span>{" "}
            <Link href="/" className="text-accent hover:text-accent-strong">
              {t("register.backLink")}
            </Link>
          </p>
          <p>
            <span>{t("register.haveAccount")}</span>{" "}
            <Link href="/login" className="text-accent hover:text-accent-strong">
              {t("register.signIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
