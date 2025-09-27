"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

type Locale = "en" | "fr";

type Messages = typeof en;

type TranslationValues = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (next: Locale) => void;
  availableLocales: Locale[];
  t: (key: string, values?: TranslationValues) => string;
};

const dictionaries: Record<Locale, Messages> = {
  en,
  fr,
};

const DEFAULT_LOCALE: Locale = "en";
const STORAGE_KEY = "preferred-language";

const I18nContext = createContext<I18nContextValue | null>(null);

function isLocale(candidate: string | null | undefined): candidate is Locale {
  if (!candidate) return false;
  return candidate === "en" || candidate === "fr";
}

function normaliseToLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (isLocale(lower)) return lower;
  const base = lower.split("-")[0];
  return isLocale(base) ? base : null;
}

function resolveMessage(messages: Messages, key: string): string | Messages | undefined {
  return key.split(".").reduce<Messages | string | undefined>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part] as Messages | string | undefined;
    }
    return undefined;
  }, messages);
}

function formatMessage(input: string, values?: TranslationValues): string {
  if (!values) return input;
  return input.replace(/\{(\w+)\}/g, (_, token: string) => {
    const value = values[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
      return;
    }

    const candidateFromLanguages = window.navigator.languages
      ?.map(normaliseToLocale)
      .filter((value): value is Locale => value !== null);

    const fromNavigator = normaliseToLocale(window.navigator.language) ?? candidateFromLanguages?.[0] ?? null;

    if (fromNavigator) {
      setLocaleState(fromNavigator);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const messages = useMemo(() => dictionaries[locale], [locale]);

  const translate = useCallback(
    (key: string, values?: TranslationValues) => {
      const resolved = resolveMessage(messages, key);
      if (typeof resolved === "string") {
        return formatMessage(resolved, values);
      }
      return key;
    },
    [messages],
  );

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    messages,
    setLocale,
    availableLocales: Object.keys(dictionaries) as Locale[],
    t: translate,
  }), [locale, messages, setLocale, translate]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(namespace?: string) {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }

  const translate = useCallback(
    (key: string, values?: TranslationValues) => {
      const finalKey = namespace ? `${namespace}.${key}` : key;
      return context.t(finalKey, values);
    },
    [context, namespace],
  );

  return {
    t: translate,
    locale: context.locale,
    setLocale: context.setLocale,
    availableLocales: context.availableLocales,
  };
}

export type { Locale };
