import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/lib/db';
import { getWorldMap, listMapPins, listMaps, saveMapPins, updateMapPalette } from '@/lib/db/queries/maps';
import * as schema from '@/lib/db/schema';
import { clusterMapPins, createMapPinId, createsMapCycle, DEFAULT_PIN_PALETTE, fitMap, MAP_CUSTOM_PALETTE_LIMIT, type MapPin, mapPoint, moveMapPins, pinColor, pinsInBox, screenPoint, zoomMap } from './maps';

const pin = (targetId: string, patch: Partial<MapPin> = {}): MapPin => ({ id: crypto.randomUUID(), kind: 'world', targetId, label: '항목', status: 'active', x: 0.2, y: 0.3, ...patch });
describe('map geometry and persistence contract', () => {
  let sqlite: InstanceType<typeof Database>; let db: DB; let project: string; let mapId: string; let targetId: string; let otherMap: string;
  beforeEach(() => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON'); db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    project = crypto.randomUUID(); mapId = crypto.randomUUID(); otherMap = crypto.randomUUID(); targetId = crypto.randomUUID();
    db.insert(schema.projects).values({ id: project, title: '검증 작품' }).run();
    db.insert(schema.worldEntries).values({ id: targetId, projectId: project, title: '왕국', category: '장소' }).run();
    for (const id of [mapId, otherMap]) db.insert(schema.worldMaps).values({ id, projectId: project, name: id, imagePath: '/test.webp', image2xPath: '/test2.webp', thumbnailPath: '/thumb.webp', width: 1600, height: 1000 }).run();
  });
  afterEach(() => sqlite.close());
  it('creates valid client IDs on LAN HTTP where randomUUID is unavailable', () => {
    expect(createMapPinId({ getRandomValues: (array) => { array.fill(1); return array; } })).toBe('01010101-0101-4101-8101-010101010101');
  });
  it('stores at most seven custom project palette colors and keeps defaults out of storage', () => {
    const colors = Array.from({ length: MAP_CUSTOM_PALETTE_LIMIT }, (_, index) => `#00000${index}`);
    for (const color of colors) updateMapPalette(db, project, 'add', color);
    expect(listMaps(db, project).palette).toEqual(colors);
    expect(() => updateMapPalette(db, project, 'add', '#000007')).toThrow('최대 7개');
    expect(() => updateMapPalette(db, project, 'add', colors[0])).toThrow('이미');
    expect(() => updateMapPalette(db, project, 'add', DEFAULT_PIN_PALETTE[0].color)).toThrow('이미');
    updateMapPalette(db, project, 'delete', colors[2]);
    expect(listMaps(db, project).palette).toEqual(colors.filter((color) => color !== colors[2]));
  });
  it('round-trips normalized coordinates, zooms around the cursor and selects live box contents', () => {
    const size = { width: 1600, height: 1000 }; const view = fitMap(800, 600, size); const position = { x: 0.25, y: 0.75 };
    const screen = screenPoint(position, view, size); expect(mapPoint(screen, view, size)).toEqual(position);
    expect(screenPoint(position, zoomMap(view, screen, view.scale * 4), size)).toEqual(screen);
    const pins = [pin(targetId), pin(targetId, { x: 0.8, y: 0.8 })];
    expect(pinsInBox(pins, { x: 0, y: 0 }, { x: 0.4, y: 0.4 })).toEqual([pins[0].id]);
    expect(pinsInBox(pins, { x: 0, y: 0 }, { x: 0.1, y: 0.1 })).toEqual([]);
    const moved = moveMapPins(pins, pins.map((item) => item.id), { x: 0.5, y: 0.5 });
    expect(moved[1].x).toBe(1); expect(moved[1].x - moved[0].x).toBeCloseTo(0.6);
  });
  it('splits clusters while zooming and exposes selected duplicate pins', () => {
    const pins = [pin(targetId, { x: 0.2, y: 0.2 }), pin(targetId, { x: 0.21, y: 0.21 })];
    expect(clusterMapPins(pins, { x: 0, y: 0, scale: 0.2 }, { width: 1000, height: 1000 }, [])).toHaveLength(1);
    expect(clusterMapPins(pins, { x: 0, y: 0, scale: 8 }, { width: 1000, height: 1000 }, [])).toHaveLength(2);
    expect(clusterMapPins(pins, { x: 0, y: 0, scale: 0.2 }, { width: 1000, height: 1000 }, [pins[0].id])).toHaveLength(2);
    expect(pinColor(pin(targetId, { status: 'inactive' }))).toBe('#737373');
  });
  it('uses a custom head color only while active', () => {
    expect(pinColor(pin(targetId, { flagColor: '#12abef' }))).toBe('#12abef');
    expect(pinColor(pin(targetId, { flagColor: '#12abef', status: 'inactive' }))).toBe('#737373');
  });
  it('keeps draft edits local until a full atomic save, permits duplicates and persists inactive status', () => {
    const pins = [pin(targetId, { flagColor: '#123456' }), pin(targetId, { x: 0.8, status: 'inactive' })];
    expect(listMapPins(db, mapId)).toEqual([]);
    const saved = saveMapPins(db, project, mapId, { revision: 1, pins });
    expect(saved.pins).toHaveLength(2); expect(saved.pins.some((item) => item.status === 'inactive')).toBe(true);
    expect(saved.pins.some((item) => item.flagColor === '#123456')).toBe(true);
    expect(() => saveMapPins(db, project, mapId, { revision: 1, pins: [] })).toThrow('다른 화면');
    expect(listMapPins(db, mapId)).toHaveLength(2);
  });
  it('rejects cross-project targets, foreign pin IDs, self links and invalid coordinates', () => {
    const otherProject = crypto.randomUUID(); const foreign = crypto.randomUUID();
    db.insert(schema.projects).values({ id: otherProject, title: '다른 작품' }).run();
    db.insert(schema.worldEntries).values({ id: foreign, projectId: otherProject, title: '비공개', category: '장소' }).run();
    expect(() => getWorldMap(db, otherProject, mapId)).toThrow('이 작품');
    for (const bad of [pin(foreign), pin(mapId, { kind: 'terrain' }), pin(targetId, { x: 1.5 })]) {
      expect(() => saveMapPins(db, project, mapId, { revision: 1, pins: [bad] })).toThrow();
    }
    expect(() => saveMapPins(db, project, mapId, { revision: 1, pins: [pin(targetId, { flagColor: 'red' })] })).toThrow('형식');
    const original = pin(targetId); saveMapPins(db, project, otherMap, { revision: 1, pins: [original] });
    expect(() => saveMapPins(db, project, mapId, { revision: 1, pins: [original] })).toThrow('다른 지도의');
    expect(listMapPins(db, mapId)).toEqual([]);
  });
  it('cascades deleted entity pins, preserves broken terrain links and allows recovery', () => {
    const item = pin(targetId); const terrain = pin(otherMap, { kind: 'terrain' });
    saveMapPins(db, project, mapId, { revision: 1, pins: [item, terrain] });
    db.delete(schema.worldEntries).where(eq(schema.worldEntries.id, targetId)).run();
    expect(listMapPins(db, mapId).map((pin) => pin.id)).toEqual([terrain.id]);
    db.delete(schema.worldMaps).where(eq(schema.worldMaps.id, otherMap)).run();
    expect(listMapPins(db, mapId)[0].targetId).toBeNull();
    saveMapPins(db, project, mapId, { revision: 2, pins: [{ ...terrain, x: 0.5, targetId: null }] });
    expect(listMapPins(db, mapId)[0].x).toBe(0.5);
    const replacement = crypto.randomUUID();
    db.insert(schema.worldMaps).values({ ...getWorldMap(db, project, mapId), id: replacement, name: '재연결' }).run();
    saveMapPins(db, project, mapId, { revision: 3, pins: [{ ...terrain, targetId: replacement }] });
    expect(listMapPins(db, mapId)[0].targetId).toBe(replacement);
  });
  it('warns about circular map links but allows them, and keeps maps when folders are deleted', () => {
    saveMapPins(db, project, mapId, { revision: 1, pins: [pin(otherMap, { kind: 'terrain' })] });
    const result = saveMapPins(db, project, otherMap, { revision: 1, pins: [pin(mapId, { kind: 'terrain' })] });
    expect(result.warning).toContain('순환 링크');
    expect(createsMapCycle('a', 'b', [{ mapId: 'b', targetId: 'c' }, { mapId: 'c', targetId: 'a' }])).toBe(true);
    const folder = crypto.randomUUID(); db.insert(schema.mapFolders).values({ id: folder, projectId: project, name: '대륙' }).run();
    db.update(schema.worldMaps).set({ folderId: folder }).where(eq(schema.worldMaps.id, mapId)).run();
    db.delete(schema.mapFolders).where(eq(schema.mapFolders.id, folder)).run();
    expect(getWorldMap(db, project, mapId).folderId).toBeNull(); expect(listMapPins(db, mapId)).toHaveLength(1);
  });
  it('rolls back pin replacement and revision if an insert fails', () => {
    saveMapPins(db, project, mapId, { revision: 1, pins: [pin(targetId)] });
    sqlite.exec("CREATE TRIGGER fail_map_pin BEFORE INSERT ON map_pins BEGIN SELECT RAISE(ABORT,'pin failure'); END");
    expect(() => saveMapPins(db, project, mapId, { revision: 2, pins: [pin(targetId)] })).toThrow();
    expect(listMapPins(db, mapId)).toHaveLength(1); expect(getWorldMap(db, project, mapId).revision).toBe(2);
  });
});
