import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

const AUTH_KEY = "metapi-auth-token";

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
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);

  const login = useCallback((t: string) => {
    try { localStorage.setItem(AUTH_KEY, t); } catch {}
    setToken(t);
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem(AUTH_KEY); } catch {}
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
