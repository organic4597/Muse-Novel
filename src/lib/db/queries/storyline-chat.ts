import { and, eq } from 'drizzle-orm';
import type { DB } from '@/lib/db';
import { authorNoteConversations } from '@/lib/db/schema';
import { AuthorNotebookError, getAuthorNote } from './author-notebook';
import { storylineMessagesSchema, type StorylineConversation, type StorylineMessage } from '@/lib/storyline-chat';

export function getStorylineConversation(db: DB, projectId: string, noteId: string): StorylineConversation {
  const note = getAuthorNote(db, projectId, noteId);
  if (!note || note.kind !== 'text') throw new AuthorNotebookError('텍스트 노트를 찾을 수 없습니다.', 404);
  const row = db.select().from(authorNoteConversations).where(eq(authorNoteConversations.noteId, noteId)).get();
  return { revision: row?.revision ?? 0, messages: row ? storylineMessagesSchema.parse(JSON.parse(row.messagesJson)) : [] };
}

// Independent of the note's content save; a stale completion cannot resurrect a cleared conversation.
export function saveStorylineConversation(db: DB, projectId: string, noteId: string, { revision, messages }: { revision: number; messages: StorylineMessage[] }): StorylineConversation {
  getStorylineConversation(db, projectId, noteId);
  const retained = storylineMessagesSchema.parse(messages.slice(-60));
  const data = { revision: revision + 1, messagesJson: JSON.stringify(retained) };
  const saved = revision === 0
    ? db.insert(authorNoteConversations).values({ noteId, ...data }).onConflictDoNothing().returning().get()
    : db.update(authorNoteConversations).set(data).where(and(eq(authorNoteConversations.noteId, noteId), eq(authorNoteConversations.revision, revision))).returning().get();
  if (!saved) throw new AuthorNotebookError('다른 화면에서 대화가 변경되었습니다. 대화를 다시 불러와 주세요.', 409);
  return { messages: retained, revision: saved.revision };
}
