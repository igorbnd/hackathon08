import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from './api';

// ─── JWT Decode (base64url) ──────────────────────────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
  [key: string]: unknown;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

// ─── Auth Context ────────────────────────────────────────────────────────────

export interface User {
  sub: string;
  email: string;
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Auth Provider ───────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // Initialize from stored token on mount
  useEffect(() => {
    const token = localStorage.getItem('idToken');
    if (token) {
      const payload = decodeJwt(token);
      if (payload && payload.exp * 1000 > Date.now()) {
        setUser({ sub: payload.sub, email: payload.email });
      } else {
        // Token expired, clear storage
        localStorage.removeItem('accessToken');
        localStorage.removeItem('idToken');
        localStorage.removeItem('refreshToken');
      }
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.signin({ email, password });
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('idToken', tokens.idToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);

    const payload = decodeJwt(tokens.idToken);
    if (payload) {
      setUser({ sub: payload.sub, email: payload.email });
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.signout();
    } catch {
      // Best-effort sign out
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    await api.signup({ email, password });
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: user !== null,
    login,
    logout,
    signup,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
