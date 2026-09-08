import { z } from 'zod';

import {
  authorNoteTitleSchema,
  mindMapContentSchema,
  textNoteContentSchema,
} from '@/lib/author-notebook';
import { removeAuthorNoteImages } from '@/lib/author-notebook-images';
import { db } from '@/lib/db';
import {
  AuthorNotebookError,
  authorNotebookFailure,
  deleteAuthorNote,
  getAuthorNote,
  listAuthorNoteAssetPaths,
  updateAuthorNote,
} from '@/lib/db/queries/author-notebook';

type Context = { params: Promise<{ id: string; noteId: string }> };

const updateSchema = z
  .object({
    content: z.unknown().optional(),
    folderId: z.string().uuid().nullable().optional(),
    title: authorNoteTitleSchema.optional(),
  })
  .strict();

export async function GET(_request: Request, { params }: Context) {
  const { id, noteId } = await params;
  const note = getAuthorNote(db, id, noteId);
  return note
    ? Response.json(note)
    : Response.json({ error: '작가 노트를 찾을 수 없습니다.' }, { status: 404 });
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id, noteId } = await params;
    const existing = getAuthorNote(db, id, noteId);
    if (!existing) throw new AuthorNotebookError('작가 노트를 찾을 수 없습니다.', 404);
    const body = updateSchema.parse(await request.json());
    let contentJson: string | undefined;
    if (body.content !== undefined) {
      if (existing.kind === 'mindmap') {
        const content = mindMapContentSchema.parse(body.content);
        const allowedPaths = new Set(listAuthorNoteAssetPaths(db, id, noteId));
        const invalidImage = content.nodes.some(
          (node) => node.imagePath && !allowedPaths.has(node.imagePath)
        );
        if (invalidImage) {
          throw new AuthorNotebookError('다른 노트의 이미지는 사용할 수 없습니다.');
        }
        contentJson = JSON.stringify(content);
      } else {
        const content = textNoteContentSchema.parse(body.content);
        const previous = textNoteContentSchema.parse(JSON.parse(existing.contentJson));
        if (previous.editorJson && !content.editorJson) {
          throw new AuthorNotebookError('서식이 있는 노트입니다. 페이지를 새로고침한 뒤 편집해주세요.', 409);
        }
        contentJson = JSON.stringify(content);
      }
    }
    return Response.json(
      updateAuthorNote(db, id, noteId, {
        contentJson,
        folderId: body.folderId,
        title: body.title,
      })
    );
  } catch (error) {
    return authorNotebookFailure(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, noteId } = await params;
    const paths = deleteAuthorNote(db, id, noteId);
    await removeAuthorNoteImages(paths);
    return Response.json({ success: true });
  } catch (error) {
    return authorNotebookFailure(error);
  }
}
