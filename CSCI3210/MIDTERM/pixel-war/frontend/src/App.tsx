import { useEffect, useRef, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { api, errorMessage } from './api';
import { PALETTE } from './palette';
import type { Color } from './palette';
import type { Session, Snapshot } from './types';

export default function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [color, setColor] = useState<Color>('#FF4500');
  const [message, setMessage] = useState('Loading canvas…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.snapshot().then(value => {
      if (active) { setSnapshot(value); setMessage('Canvas loaded.'); }
    }).catch((error: unknown) => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const context = ref.current?.getContext('2d');
    if (!context || !snapshot) return;
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, snapshot.width, snapshot.height);
    snapshot.pixels.forEach(pixel => {
      context.fillStyle = pixel.color;
      context.fillRect(pixel.x, pixel.y, 1, 1);
    });
  }, [snapshot]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await (register ? api.register : api.login)(username, password);
      setSession(result); setPassword(''); setMessage(`Signed in as ${result.username}.`);
    } catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function place(event: MouseEvent<HTMLCanvasElement>) {
    if (!session || !snapshot || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * snapshot.width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * snapshot.height / rect.height);
    setBusy(true);
    try {
      await api.place(session.token, { x, y, color });
      setSnapshot(await api.snapshot()); setMessage('Pixel saved.');
    } catch (error: unknown) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (!session) return;
    try { await api.logout(session.token); setSession(null); setMessage('Signed out.'); }
    catch (error: unknown) { setMessage(errorMessage(error)); }
  }

  return <main>
    <h1>Pixel War</h1>
    <p role="status">{message}</p>
    {session ? <p>{session.username} <button onClick={() => void logout()}>Sign out</button></p> :
      <form onSubmit={event => void authenticate(event)}>
        <label>Username <input value={username} required maxLength={150}
          onChange={e => setUsername(e.target.value)} autoComplete="username" /></label>
        <label>Password <input type="password" value={password} required
          onChange={e => setPassword(e.target.value)}
          autoComplete={register ? 'new-password' : 'current-password'} /></label>
        <label><input type="checkbox" checked={register}
          onChange={e => setRegister(e.target.checked)} /> Create a new account</label>
        <button disabled={busy}>{register ? 'Register' : 'Sign in'}</button>
      </form>}
    <div aria-label="Color palette">{PALETTE.map(value =>
      <button key={value} aria-label={value} aria-pressed={value === color}
        onClick={() => setColor(value)}
        style={{ background: value, width: 32, height: 32, margin: 2 }} />)}</div>
    {snapshot && <canvas ref={ref} width={snapshot.width} height={snapshot.height}
      onClick={event => void place(event)} aria-label="Shared pixel canvas"
      style={{ width: 600, height: 600, imageRendering: 'pixelated' }} />}
  </main>;
}
