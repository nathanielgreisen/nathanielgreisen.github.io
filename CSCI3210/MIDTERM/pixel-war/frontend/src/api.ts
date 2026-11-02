import {
  readCanvas, readHistory, readIdentity, readPlacement, readSession, readSnapshot,
} from './types';
import type { Pixel } from './types';
import { apiUrl } from './deployment';

export class ApiError extends Error {
  status: number;
  retryAfter: number;
  constructor(status: number, message: string, retryAfter = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v: unknown) => describe(v)).join(' ');
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).map(([key, v]) => `${key}: ${describe(v)}`).join(' ');
  }
  return '';
}

async function request(path: string, token: string | null = null,
  method = 'GET', body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Token ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal: AbortSignal.timeout(90000),
    });
  } catch {
    throw new Error('The server could not be reached. It may be waking up; please retry shortly.');
  }
  if (response.status === 204) return null;
  let data: unknown;
  try { data = await response.json(); }
  catch {
    if (!response.ok) throw new ApiError(response.status, 'Server returned an unreadable error.');
    throw new Error('Server returned invalid JSON.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, describe(data) || 'Request failed.',
      Number(response.headers.get('Retry-After') ?? 0));
  }
  return data;
}

export const api = {
  register: async (username: string, password: string) =>
    readSession(await request('auth/register/', null, 'POST', { username, password })),
  login: async (username: string, password: string) =>
    readSession(await request('auth/login/', null, 'POST', { username, password })),
  me: async (token: string) => readIdentity(await request('auth/me/', token)),
  logout: async (token: string) => { await request('auth/logout/', token, 'POST'); },
  canvas: async (token: string | null = null) =>
    readCanvas(await request('canvases/1/', token)),
  snapshot: async () => readSnapshot(await request('canvases/1/snapshot/')),
  place: async (token: string, pixel: Pixel) =>
    readPlacement(await request('canvases/1/pixels/', token, 'POST', pixel)),
  history: async () => readHistory(await request('canvases/1/history/')),
  rename: async (token: string, title: string) =>
    readCanvas(await request('canvases/1/rename/', token, 'PATCH', { title })),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const labels: Record<number, string> = {
      400: 'Check your input', 401: 'Sign in again', 403: 'Permission denied',
      404: 'Canvas not found', 429: 'Wait for your cooldown',
      500: 'Server error', 503: 'Service temporarily unavailable',
    };
    return `${labels[error.status] ?? 'Request failed'}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
