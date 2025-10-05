"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loginRequest, refreshTokens } from "./auth-api";
import { useRouter } from "next/navigation";

type AuthUser = {
  id: string;
  email: string;
  displayName: string;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
};

type AuthSession = {
  user: AuthUser;
  tokens: AuthTokens;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  initializing: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: (opts?: { returnTo?: string }) => void;
};

const STORAGE_KEY = "stratum_auth_session_v1";
const ACCESS_COOKIE = "stratum_access";

// Helper pour manipuler un cookie côté client (simple, pas HttpOnly mais aligné middleware)
function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
function deleteCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();
  const refreshTimerRef = useRef<number | null>(null);

  // Décoder un JWT pour récupérer exp (en secondes). Retourne epoch ms ou null.
  const getAccessExpiryMs = useCallback((token: string | null | undefined): number | null => {
    if (!token) return null;
    try {
      const payloadBase64 = token.split(".")[1];
      if (!payloadBase64) return null;
      const json = JSON.parse(atob(payloadBase64));
      const expSec = typeof json?.exp === 'number' ? json.exp : null;
      if (!expSec) return null;
      return expSec * 1000;
    } catch {
      return null;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Persistance de session (définie avant scheduleNextRefresh pour éviter la TDZ)
  const persistSession = useCallback((value: AuthSession | null) => {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      deleteCookie(ACCESS_COOKIE);
      clearRefreshTimer();
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    setCookie(ACCESS_COOKIE, value.tokens.accessToken, 90);
    // Pas de schedule ici pour éviter dépendance circulaire; gérer en amont/après login
  }, [clearRefreshTimer]);

  const scheduleNextRefresh = useCallback((sess: AuthSession) => {
    clearRefreshTimer();
    const accessExpMs = getAccessExpiryMs(sess.tokens.accessToken);
    const refreshExpMs = new Date(sess.tokens.refreshExpiresAt).getTime();
    const now = Date.now();
    // Rafraîchir 5 minutes avant l'expiration de l'accessToken (standard pour 15min)
    const REFRESH_BEFORE_MS = 5 * 60 * 1000; // 5 minutes
    let delay = 10 * 60 * 1000; // fallback 10min
    if (accessExpMs && accessExpMs > now) {
      delay = Math.max(5_000, accessExpMs - now - REFRESH_BEFORE_MS);
    }
    // Ne pas dépasser la fin du refreshToken moins 10s
    if (Number.isFinite(refreshExpMs)) {
      const maxDelay = Math.max(0, refreshExpMs - now - 10_000);
      delay = Math.min(delay, maxDelay);
    }
    // En cas de token déjà proche de la fin, essayer très bientôt
    if (!Number.isFinite(delay) || delay <= 0) delay = 5_000;

    refreshTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await refreshTokens(sess.tokens.refreshToken);
        const nextSession: AuthSession = {
          user: sess.user,
          tokens: {
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            refreshExpiresAt: res.refreshExpiresAt,
          },
        };
  setSession(nextSession);
  persistSession(nextSession);
  // replanifier
  scheduleNextRefresh(nextSession);
      } catch (err: unknown) {
        // Si erreur réseau ponctuelle, retenter plus tard; si 401, on déconnecte
        const status = (err as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) {
          // refresh invalide ou expiré
          setSession(null);
          persistSession(null);
          router.replace("/login");
          return;
        }
        // retry doux dans 1 minute
        refreshTimerRef.current = window.setTimeout(() => scheduleNextRefresh(sess), 60_000);
      }
    }, delay) as unknown as number;
  }, [clearRefreshTimer, getAccessExpiryMs, persistSession, router]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: AuthSession = JSON.parse(raw);
        setSession(parsed);
        setCookie(ACCESS_COOKIE, parsed.tokens.accessToken, 90);
        scheduleNextRefresh(parsed);
      } else {
        // Si aucune session et pas déjà sur /login -> redirection (on conserve l'URL visée)
        const path = window.location.pathname;
        if (!path.startsWith('/login')) {
          const next = encodeURIComponent(path + window.location.search + window.location.hash);
          router.replace(`/login?next=${next}`);
        }
      }
    } catch (error) {
      console.warn("Impossible de lire la session locale", error);
    } finally {
      setInitializing(false);
    }
  }, [scheduleNextRefresh, router]);

  // (persistSession déplacé plus haut)

  const login = useCallback(async ({ email, password }: LoginInput) => {
    const response = await loginRequest(email, password);
    const nextSession: AuthSession = {
      user: {
        id: response.user.id,
        email: response.user.email,
        displayName: response.user.displayName,
      },
      tokens: {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        refreshExpiresAt: response.refreshExpiresAt,
      },
    };
    setSession(nextSession);
    persistSession(nextSession);
    // Planifier le prochain refresh pour la nouvelle session
    scheduleNextRefresh(nextSession);
  }, [persistSession, scheduleNextRefresh]);

  const logout = useCallback((opts?: { returnTo?: string }) => {
    const current = window.location.pathname + window.location.search + window.location.hash;
    const next = opts?.returnTo ? opts.returnTo : current;
    setSession(null);
    persistSession(null);
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [persistSession, router]);

  // Rafraichir à la reprise de focus si proche de l'expiration d'accès
  useEffect(() => {
    function onFocus() {
      if (!session) return;
      const expMs = getAccessExpiryMs(session.tokens.accessToken);
      const REFRESH_BEFORE_MS = 2 * 60 * 1000; // 2 minutes
      if (expMs && expMs - Date.now() < REFRESH_BEFORE_MS) {
        // si moins de 2 minutes restantes, forcer un refresh immédiat
        clearRefreshTimer();
        (async () => {
          try {
            const res = await refreshTokens(session.tokens.refreshToken);
            const nextSession: AuthSession = {
              user: session.user,
              tokens: {
                accessToken: res.accessToken,
                refreshToken: res.refreshToken,
                refreshExpiresAt: res.refreshExpiresAt,
              },
            };
            setSession(nextSession);
            persistSession(nextSession);
      } catch {
        // ignorer, le timer normal reprendra
      }
        })();
      }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [session, getAccessExpiryMs, clearRefreshTimer, persistSession]);

  // Rafraîchir à chaque interaction utilisateur (clic, scroll, mouvement souris)
  useEffect(() => {
    if (!session) return;
    
    let lastRefresh = Date.now();
    const MIN_INTERVAL_MS = 5 * 60 * 1000; // Minimum 5min entre chaque refresh automatique
    
    function onActivity() {
      if (!session) return;
      const now = Date.now();
      // Éviter de spammer les refresh : minimum 5min d'intervalle
      if (now - lastRefresh < MIN_INTERVAL_MS) return;
      
      const expMs = getAccessExpiryMs(session.tokens.accessToken);
      const REFRESH_BEFORE_MS = 2 * 60 * 1000; // 2 minutes
      if (expMs && expMs - Date.now() < REFRESH_BEFORE_MS) {
        lastRefresh = now;
        (async () => {
          try {
            const res = await refreshTokens(session.tokens.refreshToken);
            const nextSession: AuthSession = {
              user: session.user,
              tokens: {
                accessToken: res.accessToken,
                refreshToken: res.refreshToken,
                refreshExpiresAt: res.refreshExpiresAt,
              },
            };
            setSession(nextSession);
            persistSession(nextSession);
            scheduleNextRefresh(nextSession);
          } catch {
            // Ignorer les erreurs silencieusement
          }
        })();
      }
    }
    
    // Écouter plusieurs types d'événements pour détecter l'activité
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('scroll', onActivity, { passive: true });
    window.addEventListener('mousemove', onActivity, { passive: true });
    
    return () => {
      window.removeEventListener('click', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity);
      window.removeEventListener('mousemove', onActivity);
    };
  }, [session, getAccessExpiryMs, persistSession, scheduleNextRefresh]);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    accessToken: session?.tokens.accessToken ?? null,
    refreshToken: session?.tokens.refreshToken ?? null,
    initializing,
    login,
    logout,
  }), [session, initializing, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit etre utilise a l'interieur d'un AuthProvider");
  }
  return context;
}
