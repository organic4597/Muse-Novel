import { z } from 'zod';

export type MapKind = 'world' | 'character' | 'terrain';
export type MapPin = { id: string; kind: MapKind; targetId: string | null; label: string; status: 'active' | 'inactive'; flagColor?: string | null; x: number; y: number };
export type WorldMap = { id: string; projectId: string; folderId: string | null; name: string; imagePath: string; image2xPath: string; thumbnailPath: string; width: number; height: number; revision: number };
export type MapFolder = { id: string; name: string; order: number };
export type MapEntity = { id: string; kind: 'world' | 'character'; title: string; category: string; summary: string; imagePath: string | null };
export type MapView = { x: number; y: number; scale: number };
export type Point = { x: number; y: number };
export const MAP_PIN_LIMIT = 500;
export const MAP_CUSTOM_PALETTE_LIMIT = 7;
export const DEFAULT_PIN_PALETTE = [
  { name: '빨강', color: '#ef4444' },
  { name: '주황', color: '#f59e0b' },
  { name: '초록', color: '#22c55e' },
  { name: '파랑', color: '#3b82f6' },
  { name: '보라', color: '#8b5cf6' },
] as const;
export const pinColorSchema = z.string().regex(/^#[0-9a-f]{6}$/iu).transform((color) => color.toLowerCase());
export const mapNameSchema = z.string().normalize('NFKC').trim().min(1).max(80).refine((value) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value));
export const mapPinsSchema = z.array(z.object({
  id: z.string().uuid(), kind: z.enum(['world', 'character', 'terrain']), targetId: z.string().uuid().nullable(),
  status: z.enum(['active', 'inactive']),
  flagColor: pinColorSchema.nullable().optional().default(null),
  label: z.string().max(300), x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1),
}).strict()).max(MAP_PIN_LIMIT);
export const PIN_COLORS = { world: '#2563eb', character: '#e11d48', terrain: '#8b5cf6' };
export function createMapPinId(source: Pick<Crypto, 'getRandomValues'> & Partial<Pick<Crypto, 'randomUUID'>> = crypto) {
  if (source.randomUUID) return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function pinColor(pin: MapPin, entities: MapEntity[] = []) {
  if (pin.status === 'inactive') return '#737373';
  if (pin.flagColor) return pin.flagColor;
  if (pin.kind !== 'world') return PIN_COLORS[pin.kind];
  const category = entities.find((entry) => entry.id === pin.targetId && entry.kind === 'world')?.category ?? '';
  const hash = [...category].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return ['#2563eb', '#0f766e', '#b45309', '#4d7c0f', '#be185d'][hash % 5];
}
export type MapLink = { mapId: string; targetId: string };
export function createsMapCycle(mapId: string, targetId: string, links: MapLink[]) {
  const stack = [targetId]; const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === mapId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const link of links) if (link.mapId === current) stack.push(link.targetId);
  }
  return false;
}

/** Screen-space grid clusters naturally split while zooming; selection always exposes individual pins. */
export function clusterMapPins(pins: MapPin[], view: MapView, size: { width: number; height: number }, selected: string[]) {
  const cells = new Map<string, MapPin[]>();
  // ponytail: dyadic grid keeps zoom splits monotonic; use a spatial index if the 500-pin limit grows.
  const grid = 2 ** Math.floor(Math.log2(48 / view.scale));
  for (const pin of pins) {
    const key = selected.includes(pin.id) ? pin.id : `${Math.floor(pin.x * size.width / grid)}:${Math.floor(pin.y * size.height / grid)}`;
    const members = cells.get(key) ?? []; members.push(pin); cells.set(key, members);
  }
  return [...cells.values()].map((members) => ({ pins: members, x: members.reduce((sum, pin) => sum + pin.x, 0) / members.length, y: members.reduce((sum, pin) => sum + pin.y, 0) / members.length }));
}

export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export function mapPoint(point: Point, view: MapView, size: { width: number; height: number }): Point {
  return { x: (point.x - view.x) / (view.scale * size.width), y: (point.y - view.y) / (view.scale * size.height) };
}
export function screenPoint(point: Point, view: MapView, size: { width: number; height: number }): Point {
  return { x: view.x + point.x * size.width * view.scale, y: view.y + point.y * size.height * view.scale };
}
export function zoomMap(view: MapView, anchor: Point, scale: number): MapView {
  return { scale, x: anchor.x - (anchor.x - view.x) * scale / view.scale, y: anchor.y - (anchor.y - view.y) * scale / view.scale };
}
export function fitMap(width: number, height: number, image: { width: number; height: number }): MapView {
  const scale = Math.min(width / image.width, height / image.height) * 0.92;
  return { scale, x: (width - image.width * scale) / 2, y: (height - image.height * scale) / 2 };
}
export function pinsInBox(pins: MapPin[], start: Point, end: Point) {
  return pins.filter((pin) => pin.x >= Math.min(start.x, end.x) && pin.x <= Math.max(start.x, end.x) && pin.y >= Math.min(start.y, end.y) && pin.y <= Math.max(start.y, end.y)).map((pin) => pin.id);
}
export function moveMapPins(pins: MapPin[], selected: string[], delta: Point) {
  const group = pins.filter((pin) => selected.includes(pin.id));
  if (!group.length) return pins;
  const dx = clamp(delta.x, -Math.min(...group.map((pin) => pin.x)), 1 - Math.max(...group.map((pin) => pin.x)));
  const dy = clamp(delta.y, -Math.min(...group.map((pin) => pin.y)), 1 - Math.max(...group.map((pin) => pin.y)));
  return pins.map((pin) => selected.includes(pin.id) ? { ...pin, x: pin.x + dx, y: pin.y + dy } : pin);
}

export function mapPinName(pin: MapPin, entities: MapEntity[], maps: WorldMap[]) {
  return (pin.kind === 'terrain' ? maps.find((map) => map.id === pin.targetId)?.name : entities.find((entry) => entry.kind === pin.kind && entry.id === pin.targetId)?.title) ?? `${pin.label} (연결 끊김)`;
}
