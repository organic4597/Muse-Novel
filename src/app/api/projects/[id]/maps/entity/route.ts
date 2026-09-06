import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { listRelationshipsForCharacter } from '@/lib/db/queries/character-relationships';
import { characters, worldEntries, worldEntryLinks, worldEntryTags } from '@/lib/db/schema';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const query = new URL(request.url).searchParams;
  const kind = query.get('kind'); const entityId = query.get('entityId') ?? '';
  if (!['world', 'character'].includes(kind ?? '')) return Response.json({ error: '항목 종류를 확인해주세요.' }, { status: 400 });
  const table = kind === 'world' ? worldEntries : characters;
  const entry = db.select().from(table).where(and(eq(table.id, entityId), eq(table.projectId, id))).get();
  if (!entry) return Response.json({ error: '삭제되었거나 이 작품에 속하지 않은 항목입니다.' }, { status: 404 });
  if (kind === 'character') {
    const owned = db.select({ id: characters.id }).from(characters).where(eq(characters.projectId, id)).all() as { id: string }[];
    const ids = new Set(owned.map((character) => character.id));
    return Response.json({ entry, related: (await listRelationshipsForCharacter(db, entityId)).filter((related: { otherCharacterId: string }) => ids.has(related.otherCharacterId)), tags: [] });
  }
  const tags = db.select().from(worldEntryTags).where(eq(worldEntryTags.entryId, entityId)).all();
  const links = db.select().from(worldEntryLinks).where(or(eq(worldEntryLinks.sourceId, entityId), eq(worldEntryLinks.targetId, entityId))).all() as typeof worldEntryLinks.$inferSelect[];
  const others = db.select({ id: worldEntries.id, title: worldEntries.title }).from(worldEntries).where(eq(worldEntries.projectId, id)).all() as { id: string; title: string }[];
  return Response.json({ entry, tags, related: links.map((link) => {
    const otherId = link.sourceId === entityId ? link.targetId : link.sourceId;
    return { otherCharacterId: otherId, otherCharacterName: others.find((item) => item.id === otherId)?.title ?? '삭제된 항목', relationshipType: link.sourceId === entityId ? '참조' : '역참조' };
  }) });
}
