import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import {
  AuthorNotebookError,
  authorNotebookFailure,
  getAuthorNote,
} from '@/lib/db/queries/author-notebook';
import { getStorylineConversation } from '@/lib/db/queries/storyline-chat';
import { storylineNoteEditRequestSchema } from '@/lib/storyline-chat';
import { resolveProjectProvider } from '@/lib/ai/resolve-project-provider';
import { planStorylineNoteEdits } from '@/lib/ai/storyline-assistant';
import { longTaskResponse } from '@/lib/ai/long-task-stream';
import { textNoteContentSchema } from '@/lib/author-notebook';

export const maxDuration = 600;

type Context = { params: Promise<{ id: string; noteId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, noteId } = await params;
    if (!await getProject(db, id)) throw new AuthorNotebookError('작품을 찾을 수 없습니다.', 404);
    const note = getAuthorNote(db, id, noteId);
    if (!note || note.kind !== 'text') throw new AuthorNotebookError('텍스트 노트를 찾을 수 없습니다.', 404);
    const body = storylineNoteEditRequestSchema.parse(await request.json());
    const conversation = getStorylineConversation(db, id, noteId);
    if (conversation.revision !== body.revision) {
      throw new AuthorNotebookError('다른 화면에서 대화가 바뀌었습니다. 다시 불러와 주세요.', 409);
    }
    const answerIndex = conversation.messages.findIndex(message => message.id === body.messageId);
    const answer = conversation.messages[answerIndex];
    if (!answer || answer.role !== 'assistant') throw new AuthorNotebookError('수정 근거가 될 AI 답변을 찾을 수 없습니다.', 404);
    const question = [...conversation.messages.slice(0, answerIndex)].reverse().find(message => message.role === 'user');
    if (!question) throw new AuthorNotebookError('답변에 연결된 작가의 수정 요청을 찾을 수 없습니다.', 409);
    const config = await resolveProjectProvider(db, id);
    if (!config) throw new AuthorNotebookError('AI 환경에서 일반 AI 제공자를 먼저 설정해주세요.', 503);
    const noteText = textNoteContentSchema.parse(JSON.parse(note.contentJson)).text;

    return longTaskResponse(request, (signal, progress) => planStorylineNoteEdits({
      projectId: id,
      question: question.text,
      answer: answer.text,
      note: noteText,
      config,
      signal,
      progress,
    }));
  } catch (error) {
    return authorNotebookFailure(error);
  }
}
