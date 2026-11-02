import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError, errorMessage } from '../api';
import { useAuth } from '../auth';
import { useCanvas } from '../useCanvas';
import type { Color } from '../palette';
import type { CanvasInfo } from '../types';
import CanvasView from './CanvasView';
import History from './History';
import Palette from './Palette';

export default function Board() {
  const { session, clear } = useAuth();
  const { canvasRef, status, ready, accept, resync } = useCanvas();
  const [info, setInfo] = useState<CanvasInfo | null>(null);
  const [color, setColor] = useState<Color>('#FF4500');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [deadline, setDeadline] = useState(() => Date.now() + (session?.retry_after ?? 0) * 1000);
  const [clock, setClock] = useState(() => Date.now());
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [title, setTitle] = useState('');
  const remaining = Math.max(0, Math.ceil((deadline - clock) / 1000));
  const disabled = !session || !ready || !info || busy || remaining > 0;

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    api.canvas(session?.token ?? null).then(value => {
      if (active) { setInfo(value); setTitle(value.title); }
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) clear();
    });
    return () => { active = false; };
  }, [session, clear, ready]);

  async function place(px: number, py: number) {
    if (disabled || !session || !info || inFlight.current) return;
    if (!Number.isInteger(px) || !Number.isInteger(py) || px < 0 || py < 0 ||
        px >= info.width || py >= info.height) {
      setMessage('Choose integer coordinates inside the canvas.'); return;
    }
    inFlight.current = true; setBusy(true); setMessage('Saving…');
    try {
      const result = await api.place(session.token, { x: px, y: py, color });
      accept(result.event);
      setDeadline(Date.now() + result.retry_after * 1000);
      setClock(Date.now());
      setMessage(result.realtime ? 'Pixel saved.' : 'Pixel saved; live delivery is recovering.');
    } catch (error: unknown) {
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.status === 429) {
        setDeadline(Date.now() + Math.max(1, error.retryAfter) * 1000);
        setClock(Date.now());
      }
      if (error instanceof ApiError && error.status === 401) clear();
      resync();
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setBusy(true);
    try { setInfo(await api.rename(session.token, title)); setMessage('Canvas renamed.'); }
    catch (error: unknown) {
      setMessage(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) clear();
    } finally { setBusy(false); }
  }

  return <section aria-label="Pixel board">
    <h2>{info?.title ?? 'Pixel War'}</h2>
    <p role="status">Connection: {status}</p>
    {!ready && <p>The free server may need about a minute to wake up after inactivity.</p>}
    <button onClick={resync}>Reload canvas</button>
    <p>{!session ? 'Sign in to place pixels. Viewing is public.' :
      remaining > 0 ? `Next placement in ${remaining}s.` : 'Ready to place a pixel.'}</p>
    <p role="status" aria-live="polite">{message}</p>
    <Palette color={color} onChange={setColor} />
    <CanvasView canvasRef={canvasRef} width={info?.width ?? 100}
      height={info?.height ?? 100} disabled={disabled}
      onPlace={(px, py) => void place(px, py)} />
    <form onSubmit={event => { event.preventDefault(); void place(x, y); }}>
      <p>Keyboard alternative: enter a coordinate and place the selected color.</p>
      <label>X <input type="number" required min={0} max={(info?.width ?? 100) - 1}
        step={1} value={x} onChange={e => setX(e.target.valueAsNumber)} /></label>
      <label>Y <input type="number" required min={0} max={(info?.height ?? 100) - 1}
        step={1} value={y} onChange={e => setY(e.target.valueAsNumber)} /></label>
      <button disabled={disabled}>Place pixel</button>
    </form>
    {info?.can_rename && <form onSubmit={event => void rename(event)}>
      <label>Canvas title <input required maxLength={80} value={title}
        onChange={e => setTitle(e.target.value)} /></label>
      <button disabled={busy}>Rename canvas</button>
    </form>}
    <History />
  </section>;
}
