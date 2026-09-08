import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../schema';
import { getStorylineConversation, saveStorylineConversation } from '../queries/storyline-chat';
import { getAuthorNote, updateAuthorNote, deleteAuthorNote } from '../queries/author-notebook';

describe('storyline conversation persistence', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  const message = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'user' as const, text: '다음 사건을 구상해줘.' };
  beforeEach(() => {
    sqlite = new Database(':memory:'); sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: './drizzle' });
    db.insert(schema.projects).values([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]).run();
    db.insert(schema.authorNotes).values({ id: 'note-a', projectId: 'a', title: '스토리라인', kind: 'text', contentJson: '{"text":"기존 구상"}' }).run();
  });
  afterEach(() => sqlite.close());
  it('keeps chat saves independent from rich note edits', () => {
    const first = saveStorylineConversation(db, 'a', 'note-a', { revision: 0, messages: [message] });
    updateAuthorNote(db, 'a', 'note-a', { contentJson: '{"text":"새 구상"}' });
    saveStorylineConversation(db, 'a', 'note-a', { revision: first.revision, messages: [message, { ...message, id: crypto.randomUUID(), role: 'assistant', text: '새로운 선택을 제안합니다.' }] });
    expect(getAuthorNote(db, 'a', 'note-a').contentJson).toBe('{"text":"새 구상"}');
    expect(getStorylineConversation(db, 'a', 'note-a').messages).toHaveLength(2);
  });
  it('rejects cross-project notes, stale replies, and late replies after clearing', () => {
    expect(() => getStorylineConversation(db, 'b', 'note-a')).toThrow();
    const first = saveStorylineConversation(db, 'a', 'note-a', { revision: 0, messages: [message] });
    expect(() => saveStorylineConversation(db, 'a', 'note-a', { revision: 0, messages: [message] })).toThrow();
    saveStorylineConversation(db, 'a', 'note-a', { revision: first.revision, messages: [] });
    expect(() => saveStorylineConversation(db, 'a', 'note-a', { revision: first.revision, messages: [message] })).toThrow();
    expect(getStorylineConversation(db, 'a', 'note-a').messages).toEqual([]);
  });
  it('cascades only this note conversation on deletion', () => {
    saveStorylineConversation(db, 'a', 'note-a', { revision: 0, messages: [message] });
    deleteAuthorNote(db, 'a', 'note-a');
    expect(db.select().from(schema.authorNoteConversations).all()).toEqual([]);
  });
});
