import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import { readEvent } from './types';
import type { PixelEvent, Snapshot } from './types';

export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acceptRef = useRef<(event: PixelEvent) => void>(() => {});
  const syncRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState('Connecting…');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    let current: Snapshot | null = null;
    let pending: PixelEvent[] = [];
    let syncing = false;
    let syncAgain = false;
    let socket: WebSocket | null = null;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let gapTimer: ReturnType<typeof setTimeout> | undefined;

    function drawSnapshot(value: Snapshot) {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas element is missing.');
      canvas.width = value.width; canvas.height = value.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas drawing is unsupported.');
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, value.width, value.height);
      value.pixels.forEach(pixel => {
        context.fillStyle = pixel.color;
        context.fillRect(pixel.x, pixel.y, 1, 1);
      });
    }

    function drawEvent(event: PixelEvent) {
      if (!current || event.x >= current.width || event.y >= current.height) {
        throw new Error('Event coordinate is outside the canvas.');
      }
      const context = canvasRef.current?.getContext('2d');
      if (!context) throw new Error('Canvas drawing is unsupported.');
      context.fillStyle = event.color;
      context.fillRect(event.x, event.y, 1, 1);
      current.version = event.version;
    }

    async function sync() {
      if (disposed) return;
      if (syncing) { syncAgain = true; return; }
      syncing = true;
      let gap = false;
      try {
        const next = await api.snapshot();
        if (disposed) return;
        drawSnapshot(next); current = next;
        const queued = pending.sort((a, b) => a.version - b.version);
        pending = [];
        for (const event of queued) {
          if (event.version <= current.version) continue;
          if (event.version !== current.version + 1) {
            pending.push(event); gap = true; continue;
          }
          drawEvent(event);
        }
        setReady(true);
        setStatus(socket?.readyState === WebSocket.OPEN ? 'Live' : 'Polling; reconnecting socket…');
      } catch (error: unknown) {
        if (!disposed) { setStatus(errorMessage(error)); setReady(false); }
      } finally {
        syncing = false;
        if (!disposed && syncAgain) {
          syncAgain = false; void sync();
        } else if (!disposed && gap) {
          clearTimeout(gapTimer);
          gapTimer = setTimeout(() => void sync(), 1000);
        }
      }
    }

    function accept(event: PixelEvent) {
      if (disposed) return;
      if (syncing || !current) { pending.push(event); return; }
      if (event.version <= current.version) return;
      if (event.version !== current.version + 1) {
        pending.push(event); void sync(); return;
      }
      drawEvent(event);
    }

    function connect() {
      if (disposed) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const connection = new WebSocket(`${protocol}//${location.host}/ws/canvas/1/`);
      socket = connection;
      connection.onopen = () => { attempts = 0; void sync(); };
      connection.onmessage = message => {
        try {
          const value: unknown = JSON.parse(String(message.data));
          accept(readEvent(value));
        } catch (error: unknown) {
          setStatus(errorMessage(error)); void sync();
        }
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if (disposed) return;
        setStatus('Socket offline; reconnecting…');
        const delay = Math.min(10000, 500 * 2 ** attempts++);
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    acceptRef.current = accept;
    syncRef.current = () => { void sync(); };
    connect();
    void sync();
    const interval = setInterval(() => void sync(), 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer); clearTimeout(gapTimer); clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      if (socket) { socket.onclose = null; socket.close(); }
      acceptRef.current = () => {}; syncRef.current = () => {};
    };
  }, []);

  const accept = useCallback((event: PixelEvent) => acceptRef.current(event), []);
  const resync = useCallback(() => syncRef.current(), []);
  return { canvasRef, status, ready, accept, resync };
}
