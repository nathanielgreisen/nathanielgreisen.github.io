import { createContext, useContext } from 'react';
import type { Session } from './types';

export interface AuthState {
  session: Session | null;
  authenticate: (mode: 'login' | 'register', username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clear: () => void;
}
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing.');
  return value;
}
