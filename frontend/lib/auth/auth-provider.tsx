"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MsalProvider } from "@azure/msal-react";
import { ensureMsalInitialized, isMsalConfigured, msalInstance } from "./msal";
import { api, setAuthTokens, clearAuthTokens, getStoredUser, AuthUser, setStoredUser } from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  msalReady: boolean;
  setSession: (access: string, refresh: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [msalReady, setMsalReady] = useState(false);

  useEffect(() => {
    // Restore local session immediately — never block UI on Microsoft SDK
    const stored = getStoredUser();
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (stored && token) {
      setUser(stored);
    } else {
      clearAuthTokens();
      setUser(null);
    }
    setLoading(false);

    if (isMsalConfigured) {
      ensureMsalInitialized()
        .then(() => setMsalReady(true))
        .catch(() => setMsalReady(false));
    }
  }, []);

  const setSession = useCallback((access: string, refresh: string, nextUser: AuthUser) => {
    setAuthTokens(access, refresh);
    setStoredUser(nextUser);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        await api.post("/api/auth/logout", { refresh_token: refresh });
      }
    } catch {
      /* ignore */
    }
    clearAuthTokens();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get<AuthUser>("/api/auth/me");
      setStoredUser(data);
      setUser(data);
    } catch {
      clearAuthTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, msalReady, setSession, logout, refreshUser }),
    [user, loading, msalReady, setSession, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (isMsalConfigured) {
    return (
      <MsalProvider instance={msalInstance}>
        <AuthStateProvider>{children}</AuthStateProvider>
      </MsalProvider>
    );
  }

  return <AuthStateProvider>{children}</AuthStateProvider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
