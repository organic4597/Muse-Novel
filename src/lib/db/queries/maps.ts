import { and, asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { characters, mapFolders, mapPaletteColors, mapPins, worldEntries, worldMaps } from '@/lib/db/schema';
import { createsMapCycle, DEFAULT_PIN_PALETTE, MAP_CUSTOM_PALETTE_LIMIT, type MapEntity, type MapPin, mapPinsSchema } from '@/lib/maps';
import { splitResearchContent } from '@/lib/web-research/content';

export class MapError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export function getWorldMap(db: DB, projectId: string, id: string) {
  const map = db.select().from(worldMaps).where(and(eq(worldMaps.id, id), eq(worldMaps.projectId, projectId))).get() as typeof worldMaps.$inferSelect | undefined;
  if (!map) throw new MapError('이 작품의 지도를 찾을 수 없습니다.', 404);
  return map;
}
export function listMaps(db: DB, projectId: string) {
  return {
    maps: db.select().from(worldMaps).where(eq(worldMaps.projectId, projectId)).orderBy(desc(worldMaps.createdAt)).all(),
    folders: db.select().from(mapFolders).where(eq(mapFolders.projectId, projectId)).orderBy(asc(mapFolders.order), asc(mapFolders.name)).all(),
    palette: db.select({ color: mapPaletteColors.color }).from(mapPaletteColors).where(eq(mapPaletteColors.projectId, projectId)).orderBy(asc(mapPaletteColors.order)).all().map(({ color }) => color),
    links: db.select({ mapId: mapPins.mapId, targetId: mapPins.linkedMapId }).from(mapPins).innerJoin(worldMaps, eq(worldMaps.id, mapPins.mapId))
      .where(and(eq(worldMaps.projectId, projectId), isNotNull(mapPins.linkedMapId))).all(),
  };
}
export function updateMapPalette(db: DB, projectId: string, action: 'add' | 'delete', color: string) {
  return db.transaction((tx: DB) => {
    const rows = tx.select().from(mapPaletteColors).where(eq(mapPaletteColors.projectId, projectId)).orderBy(asc(mapPaletteColors.order)).all();
    if (action === 'add') {
      if (DEFAULT_PIN_PALETTE.some((item) => item.color === color) || rows.some((item) => item.color === color)) throw new MapError('이미 팔레트에 있는 색상입니다.', 409);
      if (rows.length >= MAP_CUSTOM_PALETTE_LIMIT) throw new MapError(`사용자 팔레트는 최대 ${MAP_CUSTOM_PALETTE_LIMIT}개까지 추가할 수 있습니다.`, 409);
      tx.insert(mapPaletteColors).values({ projectId, color, order: (rows.at(-1)?.order ?? 0) + 1 }).run();
    } else {
      const deleted = tx.delete(mapPaletteColors).where(and(eq(mapPaletteColors.projectId, projectId), eq(mapPaletteColors.color, color))).returning({ id: mapPaletteColors.id }).all();
      if (!deleted.length) throw new MapError('삭제할 사용자 팔레트 색상을 찾을 수 없습니다.', 404);
    }
    return tx.select({ color: mapPaletteColors.color }).from(mapPaletteColors).where(eq(mapPaletteColors.projectId, projectId)).orderBy(asc(mapPaletteColors.order)).all().map(({ color }) => color);
  }, { behavior: 'immediate' });
}
export function assertMapFolder(db: DB, projectId: string, folderId: string | null) {
  if (folderId && !db.select({ id: mapFolders.id }).from(mapFolders).where(and(eq(mapFolders.id, folderId), eq(mapFolders.projectId, projectId))).get()) throw new MapError('이 작품의 지도 폴더를 선택해주세요.');
}
export function listMapEntities(db: DB, projectId: string): MapEntity[] {
  const world = db.select({ id: worldEntries.id, title: worldEntries.title, category: worldEntries.category, content: sql<string>`substr(${worldEntries.content}, 1, 500)` }).from(worldEntries).where(eq(worldEntries.projectId, projectId)).all() as { id: string; title: string; category: string; content: string | null }[];
  const people = db.select({ id: characters.id, title: characters.name, category: characters.role, summary: sql<string>`substr(${characters.backstory}, 1, 220)`, imagePath: characters.imagePath }).from(characters).where(eq(characters.projectId, projectId)).all() as { id: string; title: string; category: string | null; summary: string | null; imagePath: string | null }[];
  return [...world.map((entry): MapEntity => ({ id: entry.id, title: entry.title, category: entry.category, kind: 'world', summary: splitResearchContent(entry.content).content.slice(0, 220), imagePath: null })),
    ...people.map((entry): MapEntity => ({ ...entry, kind: 'character', category: entry.category ?? '인물', summary: entry.summary?.slice(0, 220) ?? '' }))];
}
export function listMapPins(db: DB, mapId: string): MapPin[] {
  const rows = db.select().from(mapPins).where(eq(mapPins.mapId, mapId)).orderBy(asc(mapPins.createdAt), asc(mapPins.id)).all() as typeof mapPins.$inferSelect[];
  return rows.map((pin) => ({ id: pin.id, kind: pin.kind, status: pin.status, flagColor: pin.flagColor, targetId: pin.worldEntryId ?? pin.characterId ?? pin.linkedMapId, label: pin.label, x: pin.x, y: pin.y }));
}
export function saveMapPins(db: DB, projectId: string, mapId: string, input: { revision: number; pins: unknown }) {
  const parsed = mapPinsSchema.safeParse(input.pins);
  if (!parsed.success) throw new MapError('핀 형식이나 좌표가 잘못되었습니다. 지도당 최대 500개, 좌표는 0~1이어야 합니다.');
  return db.transaction((tx: DB) => {
    const map = getWorldMap(tx, projectId, mapId);
    if (map.revision !== input.revision) throw new MapError('다른 화면에서 지도가 변경되었습니다. 임시 편집을 유지했으니 확인 후 다시 불러와주세요.', 409);
    const existing = tx.select().from(mapPins).where(eq(mapPins.mapId, mapId)).all() as typeof mapPins.$inferSelect[];
    const entities = listMapEntities(tx, projectId);
    const maps = listMaps(tx, projectId).maps as typeof worldMaps.$inferSelect[];
    const ids = new Set<string>();
    const rows = parsed.data.map((pin) => {
      if (ids.has(pin.id)) throw new MapError('핀 ID가 중복되었습니다.');
      ids.add(pin.id);
      const old = existing.find((entry) => entry.id === pin.id);
      const foreign = tx.select({ mapId: mapPins.mapId }).from(mapPins).where(eq(mapPins.id, pin.id)).get();
      if (foreign && foreign.mapId !== mapId) throw new MapError('다른 지도의 핀은 변경할 수 없습니다.');
      if (pin.kind === 'terrain' && pin.targetId === mapId) throw new MapError('자기 자신으로 연결할 수 없습니다.');
      const target = pin.kind === 'terrain' ? maps.find((entry) => entry.id === pin.targetId) : entities.find((entry) => entry.id === pin.targetId && entry.kind === pin.kind);
      // Only a terrain link survives target deletion; entity pins use FK CASCADE.
      if (!target && !(old && old.kind === 'terrain' && pin.kind === 'terrain' && !old.linkedMapId)) throw new MapError('삭제되었거나 다른 작품에 속한 항목/지도입니다. 새로 불러와 대상을 다시 선택해주세요.', 409);
      const targetId = target ? pin.targetId : null;
      return { id: pin.id, mapId, kind: pin.kind, status: pin.status, flagColor: pin.flagColor, x: pin.x, y: pin.y,
        worldEntryId: pin.kind === 'world' ? targetId : null, characterId: pin.kind === 'character' ? targetId : null, linkedMapId: pin.kind === 'terrain' ? targetId : null,
        label: target ? ('title' in target ? target.title : target.name) : old!.label,
        createdAt: old?.createdAt ?? new Date(), updatedAt: new Date() };
    });
    tx.delete(mapPins).where(eq(mapPins.mapId, mapId)).run();
    // ponytail: one atomic full snapshot, bounded at 500 pins; use delta writes only if that cap grows.
    if (rows.length) tx.insert(mapPins).values(rows).run();
    tx.update(worldMaps).set({ revision: map.revision + 1, updatedAt: new Date() }).where(eq(worldMaps.id, mapId)).run();
    const links = listMaps(tx, projectId).links as { mapId: string; targetId: string }[];
    const cycle = rows.some((pin) => pin.linkedMapId && createsMapCycle(mapId, pin.linkedMapId, links));
    return { map: getWorldMap(tx, projectId, mapId), pins: listMapPins(tx, mapId), warning: cycle ? '순환 링크가 감지되었습니다. 연결은 허용되며 저장했습니다.' : undefined };
  }, { behavior: 'immediate' });
}
