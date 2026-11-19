// Public address only. VITE_ values are included in the downloadable JavaScript.
const backendOrigin = (import.meta.env.VITE_BACKEND_URL ?? '').trim().replace(/\/+$/, '');

export const backendConfigured = import.meta.env.DEV || backendOrigin !== '';

export function apiUrl(path: string): string {
  return `${backendOrigin}/api/${path}`;
}

export function socketUrl(): string {
  const url = new URL('/ws/canvas/1/', backendOrigin || window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
