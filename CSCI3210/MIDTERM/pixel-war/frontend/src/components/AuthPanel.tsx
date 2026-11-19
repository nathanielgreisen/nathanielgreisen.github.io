import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../auth';
import { errorMessage } from '../api';

export default function AuthPanel() {
  const { session, authenticate, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await authenticate(mode, username, password); setPassword(''); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { await signOut(); setMessage('Signed out.'); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section aria-label="Account">
    {session ? <p>Signed in as {session.username}.{' '}
      <button disabled={busy} onClick={() => void logout()}>Sign out</button></p> :
      <form onSubmit={event => void submit(event)}>
        <label>Username <input required maxLength={150} autoComplete="username"
          value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label>Password <input type="password" required value={password}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          onChange={e => setPassword(e.target.value)} /></label>
        <label>Action <select value={mode} onChange={e =>
          setMode(e.target.value === 'register' ? 'register' : 'login')}>
          <option value="login">Sign in</option><option value="register">Register</option>
        </select></label>
        <button disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register'}</button>
      </form>}
    <p role="status">{message}</p>
  </section>;
}
