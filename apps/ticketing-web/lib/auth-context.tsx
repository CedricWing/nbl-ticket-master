'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import {
  clearToken,
  clearUser,
  getUser,
  setToken as persistToken,
  setUser as persistUser,
  type User,
} from '@/lib/api-client';

interface AuthContextValue {
  user: User | null;
  // True once the post-mount localStorage read has run — lets consumers hold off rendering
  // a "logged out" view until they know that's not just the pre-hydration default.
  initialized: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // localStorage doesn't exist during SSR, so this has to run post-mount to avoid a
    // hydration mismatch. Because every consumer reads from this one provider (instead of
    // each component re-reading localStorage on its own), login()/logout() below are
    // reflected everywhere immediately, including in components mounted before the change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getUser());
    setInitialized(true);
  }, []);

  function login(nextUser: User, token: string) {
    persistToken(token);
    persistUser(nextUser);
    setUser(nextUser);
  }

  function logout() {
    clearToken();
    clearUser();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, initialized, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
