import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { AuthContext } from './auth';
import type { Session } from './types';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const clear = useCallback(() => setSession(null), []);
  const authenticate = useCallback(async (
    mode: 'login' | 'register', username: string, password: string,
  ) => { setSession(await api[mode](username, password)); }, []);
  const signOut = useCallback(async () => {
    if (!session) return;
    try { await api.logout(session.token); }
    finally { setSession(null); }
  }, [session]);
  const value = useMemo(() => ({ session, authenticate, signOut, clear }),
    [session, authenticate, signOut, clear]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
