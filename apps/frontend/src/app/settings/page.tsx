"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation, type Locale } from "@/i18n";

export default function SettingsPage() {
  const { t, locale, availableLocales, setLocale } = useTranslation();
  const [feedback, setFeedback] = useState<string | null>(null);

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

          {feedback ? (
            <p className="mt-4 text-sm text-accent">{feedback}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
