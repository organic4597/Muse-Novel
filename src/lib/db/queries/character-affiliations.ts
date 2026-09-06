import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { AffiliationBoundary, AffiliationEventInput } from '@/lib/character-affiliations';
import type { DB } from '@/lib/db';
import { chapters, characterAffiliationAudits, characterAffiliationEvents, characterAffiliationMembers, characterAffiliationVersions, characters, worldEntries } from '@/lib/db/schema';
import { listWorldEntriesByTrait } from './world-categories';

export class CharacterAffiliationError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) { super(message); this.status = status; }
}

type Membership = { id: string; organizationEntryId: string | null; organizationTitle: string; position: string | null; isPrimary: number };
type Event = {
  id: string; projectId: string; characterId: string; chapterId: string | null; chapterTitle: string | null;
  chapterOrder: number | null; boundary: AffiliationBoundary; reason: string | null;
  createdAt: Date | null; updatedAt: Date | null; memberships: Membership[];
};

function listEvents(db: DB, projectId: string, characterId: string): Event[] {
  const rows = db.select({
    id: characterAffiliationEvents.id, projectId: characterAffiliationEvents.projectId,
    characterId: characterAffiliationEvents.characterId, chapterId: characterAffiliationEvents.chapterId,
    chapterTitle: chapters.title, chapterTitleSnapshot: characterAffiliationEvents.chapterTitleSnapshot,
    chapterOrder: chapters.order, boundary: characterAffiliationEvents.boundary,
    reason: characterAffiliationEvents.reason, createdAt: characterAffiliationEvents.createdAt,
    updatedAt: characterAffiliationEvents.updatedAt,
  }).from(characterAffiliationEvents).leftJoin(chapters, eq(characterAffiliationEvents.chapterId, chapters.id))
    .where(and(eq(characterAffiliationEvents.projectId, projectId), eq(characterAffiliationEvents.characterId, characterId))).all();
  if (!rows.length) return [];
  const members = db.select().from(characterAffiliationMembers)
    .where(inArray(characterAffiliationMembers.eventId, rows.map((row) => row.id))).all();
  return rows.map((row) => ({ ...row, boundary: row.chapterId || row.boundary === 'initial' ? row.boundary : 'unplaced',
    chapterTitle: row.chapterTitle ?? row.chapterTitleSnapshot,
    memberships: members.filter((member) => member.eventId === row.id).map((member) => ({
      id: member.id, organizationEntryId: member.organizationEntryId,
      organizationTitle: member.organizationTitleSnapshot, position: member.position, isPrimary: member.isPrimary,
    })),
  })).sort((left, right) => {
    const rank = (event: Event) => event.boundary === 'initial' ? -1 : event.boundary === 'unplaced' ? Number.MAX_SAFE_INTEGER : (event.chapterOrder ?? Number.MAX_SAFE_INTEGER) * 2 + (event.boundary === 'chapter_end' ? 1 : 0);
    return rank(left) - rank(right) || left.id.localeCompare(right.id);
  });
}

function eventRank(event: Event) {
  if (event.boundary === 'initial') return -1;
  if (event.boundary === 'unplaced' || event.chapterOrder === null) return Number.MAX_SAFE_INTEGER;
  return event.chapterOrder * 2 + (event.boundary === 'chapter_end' ? 1 : 0);
}

export async function getCharacterAffiliations(db: DB, projectId: string, characterId: string, options: { chapterId?: string; boundary?: 'start' | 'end' } = {}) {
  const character = db.select().from(characters).where(and(eq(characters.projectId, projectId), eq(characters.id, characterId))).get();
  if (!character) throw new CharacterAffiliationError('이 작품의 캐릭터를 찾을 수 없습니다.', 404);
  const events = listEvents(db, projectId, characterId);
  let targetRank = Number.MAX_SAFE_INTEGER - 1;
  if (options.chapterId) {
    const chapter = db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, options.chapterId))).get();
    if (!chapter) throw new CharacterAffiliationError('이 작품의 회차를 찾을 수 없습니다.', 404);
    targetRank = chapter.order * 2 + (options.boundary === 'end' ? 1 : 0);
  }
  const effective = events.filter((event) => eventRank(event) <= targetRank).at(-1) ?? null;
  const upcoming = options.chapterId ? events.find((event) => eventRank(event) === targetRank + 1) ?? null : null;
  const [organizationOptions, chapterOptions] = await Promise.all([
    listWorldEntriesByTrait(db, projectId, 'organization'),
    db.select({ id: chapters.id, title: chapters.title, order: chapters.order }).from(chapters)
      .where(eq(chapters.projectId, projectId)).orderBy(asc(chapters.order)).all(),
  ]);
  const revision = db.select({ revision: characterAffiliationVersions.revision }).from(characterAffiliationVersions)
    .where(eq(characterAffiliationVersions.characterId, characterId)).get()?.revision ?? 0;
  return { characterId, revision, current: effective, upcoming, events,
    organizationOptions: organizationOptions.map((entry) => ({ id: entry.id, title: entry.title, category: entry.category })),
    chapters: chapterOptions,
  };
}

export function getAffiliationSummariesAt(db: DB, projectId: string, characterIds: string[], chapterId: string) {
  if (!characterIds.length) return new Map<string, Membership[]>();
  const chapter = db.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, chapterId))).get();
  if (!chapter) return new Map<string, Membership[]>();
  const ids = [...new Set(characterIds)];
  const rows = db.select({
    id: characterAffiliationEvents.id, projectId: characterAffiliationEvents.projectId,
    characterId: characterAffiliationEvents.characterId, chapterId: characterAffiliationEvents.chapterId,
    chapterTitle: chapters.title, chapterTitleSnapshot: characterAffiliationEvents.chapterTitleSnapshot,
    chapterOrder: chapters.order, boundary: characterAffiliationEvents.boundary,
    reason: characterAffiliationEvents.reason, createdAt: characterAffiliationEvents.createdAt,
    updatedAt: characterAffiliationEvents.updatedAt,
  }).from(characterAffiliationEvents).leftJoin(chapters, eq(characterAffiliationEvents.chapterId, chapters.id))
    .where(and(eq(characterAffiliationEvents.projectId, projectId), inArray(characterAffiliationEvents.characterId, ids))).all();
  const members = rows.length ? db.select().from(characterAffiliationMembers)
    .where(inArray(characterAffiliationMembers.eventId, rows.map((row) => row.id))).all() : [];
  const result = new Map<string, Membership[]>();
  for (const characterId of ids) {
    const event = rows.filter((row) => row.characterId === characterId).map((row): Event => ({
      ...row, boundary: row.chapterId || row.boundary === 'initial' ? row.boundary : 'unplaced',
      chapterTitle: row.chapterTitle ?? row.chapterTitleSnapshot,
      memberships: members.filter((member) => member.eventId === row.id).map((member) => ({
        id: member.id, organizationEntryId: member.organizationEntryId,
        organizationTitle: member.organizationTitleSnapshot, position: member.position, isPrimary: member.isPrimary,
      })),
    })).sort((left, right) => eventRank(left) - eventRank(right)).filter((candidate) => eventRank(candidate) <= chapter.order * 2).at(-1);
    result.set(characterId, event?.memberships ?? []);
  }
  return result;
}

function snapshot(event: Event | undefined) {
  return event ? JSON.stringify(event) : null;
}

export async function createAffiliationEvent(db: DB, projectId: string, characterId: string, input: AffiliationEventInput) {
  return db.transaction((tx: DB) => {
    const character = tx.select().from(characters).where(and(eq(characters.projectId, projectId), eq(characters.id, characterId))).get();
    if (!character) throw new CharacterAffiliationError('이 작품의 캐릭터를 찾을 수 없습니다.', 404);
    const revision = tx.select({ revision: characterAffiliationVersions.revision }).from(characterAffiliationVersions)
      .where(eq(characterAffiliationVersions.characterId, characterId)).get()?.revision ?? 0;
    if (revision !== input.expectedRevision) throw new CharacterAffiliationError('소속 이력이 다른 화면에서 변경되었습니다. 최신 내용을 다시 확인해주세요.');
    const chapter = input.chapterId ? tx.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, input.chapterId))).get() : null;
    if (input.chapterId && !chapter) throw new CharacterAffiliationError('다른 작품의 회차를 사용할 수 없습니다.', 400);
    const duplicate = listEvents(tx, projectId, characterId).find((event) => event.boundary === input.boundary && event.chapterId === input.chapterId);
    if (duplicate) throw new CharacterAffiliationError('같은 적용 시점의 소속 기록이 이미 있습니다. 기존 기록을 정정해주세요.');
    const organizations = input.memberships.length ? tx.select().from(worldEntries)
      .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.id, input.memberships.map((membership) => membership.organizationEntryId)))).all() : [];
    const eligibleIds = new Set(listWorldEntriesByTrait(tx, projectId, 'organization').map((entry) => entry.id));
    if (organizations.length !== input.memberships.length || organizations.some((entry) => !eligibleIds.has(entry.id))) {
      throw new CharacterAffiliationError('단체 특성이 있는 이 작품의 세계관 항목만 소속으로 선택할 수 있습니다.', 400);
    }
    const event = tx.insert(characterAffiliationEvents).values({
      projectId, characterId, chapterId: input.chapterId, boundary: input.boundary,
      chapterTitleSnapshot: chapter?.title ?? null, reason: input.reason ?? null,
    }).returning().all()[0];
    if (!event) throw new CharacterAffiliationError('소속 기록을 저장하지 못했습니다.', 500);
    for (const membership of input.memberships) {
      const organization = organizations.find((entry) => entry.id === membership.organizationEntryId)!;
      tx.insert(characterAffiliationMembers).values({ eventId: event.id, organizationEntryId: organization.id,
        organizationTitleSnapshot: organization.title, position: membership.position ?? null,
        isPrimary: membership.isPrimary ? 1 : 0,
      }).run();
    }
    tx.insert(characterAffiliationVersions).values({ projectId, characterId, revision: revision + 1 })
      .onConflictDoUpdate({ target: characterAffiliationVersions.characterId, set: { revision: revision + 1 } }).run();
    const created = listEvents(tx, projectId, characterId).find((row) => row.id === event.id)!;
    tx.insert(characterAffiliationAudits).values({ projectId, characterId, eventId: event.id,
      action: 'create', afterJson: snapshot(created), reason: input.reason ?? null,
    }).run();
    return created;
  }, { behavior: 'immediate' });
}

export async function deleteAffiliationEvent(db: DB, options: { projectId: string; characterId: string; eventId: string; expectedRevision: number }) {
  const { projectId, characterId, eventId, expectedRevision } = options;
  return db.transaction((tx: DB) => {
    const character = tx.select().from(characters).where(and(eq(characters.projectId, projectId), eq(characters.id, characterId))).get();
    const event = listEvents(tx, projectId, characterId).find((row) => row.id === eventId);
    if (!character || !event) throw new CharacterAffiliationError('소속 기록을 찾을 수 없습니다.', 404);
    const revision = tx.select({ revision: characterAffiliationVersions.revision }).from(characterAffiliationVersions)
      .where(eq(characterAffiliationVersions.characterId, characterId)).get()?.revision ?? 0;
    if (revision !== expectedRevision) throw new CharacterAffiliationError('소속 이력이 다른 화면에서 변경되었습니다. 최신 내용을 다시 확인해주세요.');
    tx.insert(characterAffiliationAudits).values({ projectId, characterId, eventId, action: 'delete', beforeJson: snapshot(event), reason: '소속 기록 삭제' }).run();
    tx.delete(characterAffiliationEvents).where(eq(characterAffiliationEvents.id, eventId)).run();
    tx.insert(characterAffiliationVersions).values({ projectId, characterId, revision: expectedRevision + 1 })
      .onConflictDoUpdate({ target: characterAffiliationVersions.characterId, set: { revision: expectedRevision + 1 } }).run();
    return { deleted: true };
  }, { behavior: 'immediate' });
}

export async function updateAffiliationEvent(db: DB, options: { projectId: string; characterId: string; eventId: string }, input: AffiliationEventInput) {
  const { projectId, characterId, eventId } = options;
  return db.transaction((tx: DB) => {
    const character = tx.select().from(characters).where(and(eq(characters.projectId, projectId), eq(characters.id, characterId))).get();
    const before = listEvents(tx, projectId, characterId).find((row) => row.id === eventId);
    if (!character || !before) throw new CharacterAffiliationError('소속 기록을 찾을 수 없습니다.', 404);
    const revision = tx.select({ revision: characterAffiliationVersions.revision }).from(characterAffiliationVersions)
      .where(eq(characterAffiliationVersions.characterId, characterId)).get()?.revision ?? 0;
    if (revision !== input.expectedRevision) throw new CharacterAffiliationError('소속 이력이 다른 화면에서 변경되었습니다. 최신 내용을 다시 확인해주세요.');
    const chapter = input.chapterId ? tx.select().from(chapters).where(and(eq(chapters.projectId, projectId), eq(chapters.id, input.chapterId))).get() : null;
    if (input.chapterId && !chapter) throw new CharacterAffiliationError('다른 작품의 회차를 사용할 수 없습니다.', 400);
    const duplicate = listEvents(tx, projectId, characterId).find((event) => event.id !== eventId && event.boundary === input.boundary && event.chapterId === input.chapterId);
    if (duplicate) throw new CharacterAffiliationError('같은 적용 시점의 소속 기록이 이미 있습니다.');
    const organizations = input.memberships.length ? tx.select().from(worldEntries)
      .where(and(eq(worldEntries.projectId, projectId), inArray(worldEntries.id, input.memberships.map((membership) => membership.organizationEntryId)))).all() : [];
    const eligibleIds = new Set(listWorldEntriesByTrait(tx, projectId, 'organization').map((entry) => entry.id));
    if (organizations.length !== input.memberships.length || organizations.some((entry) => !eligibleIds.has(entry.id))) {
      throw new CharacterAffiliationError('단체 특성이 있는 이 작품의 세계관 항목만 소속으로 선택할 수 있습니다.', 400);
    }
    tx.delete(characterAffiliationMembers).where(eq(characterAffiliationMembers.eventId, eventId)).run();
    tx.update(characterAffiliationEvents).set({ chapterId: input.chapterId, boundary: input.boundary,
      chapterTitleSnapshot: chapter?.title ?? before.chapterTitle, reason: input.reason ?? null, updatedAt: new Date(),
    }).where(eq(characterAffiliationEvents.id, eventId)).run();
    for (const membership of input.memberships) {
      const organization = organizations.find((entry) => entry.id === membership.organizationEntryId)!;
      tx.insert(characterAffiliationMembers).values({ eventId, organizationEntryId: organization.id,
        organizationTitleSnapshot: organization.title, position: membership.position ?? null, isPrimary: membership.isPrimary ? 1 : 0,
      }).run();
    }
    tx.insert(characterAffiliationVersions).values({ projectId, characterId, revision: revision + 1 })
      .onConflictDoUpdate({ target: characterAffiliationVersions.characterId, set: { revision: revision + 1 } }).run();
    const after = listEvents(tx, projectId, characterId).find((row) => row.id === eventId)!;
    tx.insert(characterAffiliationAudits).values({ projectId, characterId, eventId, action: 'update', beforeJson: snapshot(before), afterJson: snapshot(after), reason: input.reason ?? '소속 기록 정정' }).run();
    return after;
  }, { behavior: 'immediate' });
}
