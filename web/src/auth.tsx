import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** True when the session was opened by Cloudflare Access (no app password involved). */
  viaAccess: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

// Set when the session was opened through Cloudflare Access, so that logging out also ends the
// Access session (otherwise the next page load would silently sign the person in again).
const VIA_ACCESS_KEY = 'weatheralert.viaAccess';

function readViaAccess(): boolean {
  try {
    return localStorage.getItem(VIA_ACCESS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeViaAccess(on: boolean): void {
  try {
    if (on) localStorage.setItem(VIA_ACCESS_KEY, '1');
    else localStorage.removeItem(VIA_ACCESS_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [viaAccess, setViaAccess] = useState<boolean>(() => Boolean(getToken()) && readViaAccess());

  useEffect(() => {
    async function boot() {
      if (getToken()) {
        try {
          const r = await api<{ user: User }>('/auth/me');
          setUser(r.user);
          return;
        } catch {
          setToken(null);
        }
      }
      // No usable token: behind Cloudflare Access the API can sign us in from the Access assertion.
      // Anywhere else this fails quietly and the normal login form is shown.
      try {
        const r = await api<{ token: string; user: User }>('/auth/access', { method: 'POST' });
        setToken(r.token);
        writeViaAccess(true);
        setViaAccess(true);
        setUser(r.user);
      } catch {
        /* not behind Access, or not allowed: show the login form */
      }
    }
    boot().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('weatheralert:logout', onLogout);
    return () => window.removeEventListener('weatheralert:logout', onLogout);
  }, []);

  const login = useCallback((token: string, u: User) => {
    setToken(token);
    writeViaAccess(false);
    setViaAccess(false);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    const endAccessSession = readViaAccess();
    setToken(null);
    writeViaAccess(false);
    setViaAccess(false);
    setUser(null);
    if (endAccessSession) window.location.assign('/cdn-cgi/access/logout');
  }, []);

  const value = useMemo(
    () => ({ user, loading, viaAccess, login, logout, setUser }),
    [user, loading, viaAccess, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
