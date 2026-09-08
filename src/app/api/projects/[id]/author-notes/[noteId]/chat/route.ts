import { z } from 'zod';
import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { AuthorNotebookError, authorNotebookFailure, getAuthorNote } from '@/lib/db/queries/author-notebook';
import { getStorylineConversation, saveStorylineConversation } from '@/lib/db/queries/storyline-chat';
import { listChapterSummaries } from '@/lib/db/queries/chapters';
import { storylineRequestSchema } from '@/lib/storyline-chat';
import { resolveProjectProvider } from '@/lib/ai/resolve-project-provider';
import { replyToStoryline } from '@/lib/ai/storyline-assistant';
import { longTaskResponse } from '@/lib/ai/long-task-stream';

export const maxDuration = 600;
type Context = { params: Promise<{ id: string; noteId: string }> };
async function authorize({ params }: Context) {
  const { id, noteId } = await params;
  if (!await getProject(db, id)) throw new AuthorNotebookError('작품을 찾을 수 없습니다.', 404);
  const note = getAuthorNote(db, id, noteId);
  if (!note || note.kind !== 'text') throw new AuthorNotebookError('텍스트 노트를 찾을 수 없습니다.', 404);
  return { id, noteId, note };
}
export async function GET(_request: Request, context: Context) {
  try {
    const { id, noteId } = await authorize(context);
    const chapters = (await listChapterSummaries(db, id)).map(chapter => ({ id: chapter.id, title: chapter.title }));
    return Response.json({ ...getStorylineConversation(db, id, noteId), chapters }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return authorNotebookFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { id, noteId, note } = await authorize(context);
    const body = storylineRequestSchema.parse(await request.json());
    const conversation = getStorylineConversation(db, id, noteId);
    if (conversation.revision !== body.revision) throw new AuthorNotebookError('다른 화면에서 대화가 바뀌었습니다. 다시 불러와 주세요.', 409);
    if (body.chapterId && !(await listChapterSummaries(db, id)).some(chapter => chapter.id === body.chapterId)) throw new AuthorNotebookError('회차를 찾을 수 없습니다.', 404);
    const config = await resolveProjectProvider(db, id);
    if (!config) throw new AuthorNotebookError('AI 환경에서 일반 AI 제공자를 먼저 설정해주세요.', 503);
    return longTaskResponse(request, async (signal, progress, delta) => {
      const answer = await replyToStoryline({ db, projectId: id, noteContentJson: note.contentJson, history: conversation.messages,
        message: body.message, chapterId: body.chapterId, config, signal, progress, delta });
      signal.throwIfAborted();
      return saveStorylineConversation(db, id, noteId, { revision: conversation.revision, messages: [...conversation.messages,
        { id: crypto.randomUUID(), role: 'user', text: body.message },
        { id: crypto.randomUUID(), role: 'assistant', ...answer },
      ] });
    });
  } catch (error) { return authorNotebookFailure(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { id, noteId } = await authorize(context);
    const { revision } = z.object({ revision: z.number().int().nonnegative() }).parse(await request.json());
    return Response.json(saveStorylineConversation(db, id, noteId, { revision, messages: [] }));
  } catch (error) { return authorNotebookFailure(error); }
}
