import { PALETTE } from './palette';
import type { Color } from './palette';

export interface Pixel { x: number; y: number; color: Color }
export interface PixelEvent extends Pixel {
  type: 'pixel'; version: number; username: string;
}
export interface Snapshot {
  width: number; height: number; version: number; pixels: Pixel[];
}
export interface CanvasInfo {
  id: number; title: string; width: number; height: number;
  cooldown_seconds: number; can_rename: boolean;
}
export interface Session { token: string; username: string; retry_after: number }
export interface Identity { username: string; retry_after: number }
export interface PlacementResult {
  event: PixelEvent; retry_after: number; realtime: boolean;
}
export interface HistoryEntry extends Pixel {
  id: number; username: string; version: number; created_at: string;
}

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a JSON object.');
  }
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Expected a non-negative number.');
  }
  return value;
}
export function integer(value: unknown): number {
  const n = number(value);
  if (!Number.isSafeInteger(n)) throw new Error('Expected an integer.');
  return n;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected true or false.');
  return value;
}
export function array<T>(value: unknown, read: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error('Expected a JSON array.');
  return value.map((item: unknown) => read(item));
}
export function readPixel(value: unknown): Pixel {
  const v = object(value);
  const color = PALETTE.find(candidate => candidate === v.color);
  if (!color) throw new Error('Unrecognized palette color.');
  return { x: integer(v.x), y: integer(v.y), color };
}
export function readEvent(value: unknown): PixelEvent {
  const v = object(value);
  if (v.type !== 'pixel') throw new Error('Unexpected socket message.');
  return { ...readPixel(v), type: 'pixel', version: integer(v.version),
    username: text(v.username) };
}
export function readSnapshot(value: unknown): Snapshot {
  const v = object(value);
  const result = { width: integer(v.width), height: integer(v.height),
    version: integer(v.version), pixels: array(v.pixels, readPixel) };
  if (result.width < 1 || result.height < 1 || result.width > 1000 || result.height > 1000 ||
      result.pixels.some(p => p.x >= result.width || p.y >= result.height)) {
    throw new Error('Invalid canvas dimensions or coordinates.');
  }
  return result;
}
export function readCanvas(value: unknown): CanvasInfo {
  const v = object(value);
  return { id: integer(v.id), title: text(v.title), width: integer(v.width),
    height: integer(v.height), cooldown_seconds: integer(v.cooldown_seconds),
    can_rename: boolean(v.can_rename) };
}
export function readIdentity(value: unknown): Identity {
  const v = object(value);
  return { username: text(v.username), retry_after: number(v.retry_after) };
}
export function readSession(value: unknown): Session {
  return { ...readIdentity(value), token: text(object(value).token) };
}
export function readPlacement(value: unknown): PlacementResult {
  const v = object(value);
  return { event: readEvent(v.event), retry_after: number(v.retry_after),
    realtime: boolean(v.realtime) };
}
export function readHistory(value: unknown): HistoryEntry[] {
  return array(value, item => {
    const v = object(item);
    return { ...readPixel(v), id: integer(v.id), username: text(v.username),
      version: integer(v.version), created_at: text(v.created_at) };
  });
}
