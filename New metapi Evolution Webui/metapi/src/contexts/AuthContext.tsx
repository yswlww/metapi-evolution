import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { clearSession, persistSession, readSession } from "../lib/session";

interface AuthCtx {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthCtx>({
  token: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
});

function getStoredToken(): string | null {
  try { return readSession(localStorage); } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);

  const login = useCallback((value: string) => {
    const clean = value.trim();
    try { persistSession(localStorage, clean); } catch {}
    setToken(clean || null);
  }, []);

  const logout = useCallback(() => {
    try { clearSession(localStorage); } catch {}
    setToken(null);
  }, []);

  useEffect(() => {
    const sync = () => setToken(getStoredToken());
    const interval = window.setInterval(sync, 30_000);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("metapi-session-cleared", sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("metapi-session-cleared", sync);
    };
  }, []);

  return <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
