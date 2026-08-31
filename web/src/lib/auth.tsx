import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
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
  signup: (email: string, password: string) => Promise<{ signedIn: boolean }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ─── Auth Provider ───────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  // Initialise synchronously from stored token during the first render.
  //
  // This must NOT be done in useEffect: child effects run before parent effects
  // in React, so a route guard (ProtectedRoute) or a redirect on `/` would read
  // `isAuthenticated === false` and navigate away before this provider had a
  // chance to restore the session. localStorage is synchronous, so a lazy
  // useState initialiser gives us the correct value on the very first render.
  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem('idToken');
    if (!token) return null;

    const payload = decodeJwt(token);
    if (payload && payload.exp * 1000 > Date.now()) {
      return { sub: payload.sub, email: payload.email };
    }

    // Token missing or expired — clear stale storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('idToken');
    localStorage.removeItem('refreshToken');
    return null;
  });

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

  /**
   * Create an account. Accounts are auto-confirmed server-side in this
   * prototype, so on success we sign the user straight in rather than bouncing
   * them to the login page. Returns whether the session was established.
   */
  const signup = useCallback(
    async (email: string, password: string): Promise<{ signedIn: boolean }> => {
      const result = await api.signup({ email, password });

      if (!result.confirmed) {
        // Auto-confirm failed server-side; the account exists but cannot be
        // signed into yet. Caller should tell the user rather than silently fail.
        return { signedIn: false };
      }

      await login(email, password);
      return { signedIn: true };
    },
    [login],
  );

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
