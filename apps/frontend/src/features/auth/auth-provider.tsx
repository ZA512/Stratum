"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loginRequest } from "./auth-api";

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
  logout: () => void;
};

const STORAGE_KEY = "stratum_auth_session_v1";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: AuthSession = JSON.parse(raw);
        setSession(parsed);
      }
    } catch (error) {
      console.warn("Impossible de lire la session locale", error);
    } finally {
      setInitializing(false);
    }
  }, []);

  const persistSession = useCallback((value: AuthSession | null) => {
    if (!value) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, []);

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
  }, [persistSession]);

  const logout = useCallback(() => {
    setSession(null);
    persistSession(null);
  }, [persistSession]);

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
