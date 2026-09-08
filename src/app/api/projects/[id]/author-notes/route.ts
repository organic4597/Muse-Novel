import { z } from 'zod';

import {
  AUTHOR_NOTE_KINDS,
  authorNoteFolderNameSchema,
  authorNoteTitleSchema,
} from '@/lib/author-notebook';
import { db } from '@/lib/db';
import {
  authorNotebookFailure,
  createAuthorNote,
  createAuthorNoteFolder,
  deleteAuthorNoteFolder,
  listAuthorNotebook,
  renameAuthorNoteFolder,
} from '@/lib/db/queries/author-notebook';
import { getProject } from '@/lib/db/queries/projects';

type Context = { params: Promise<{ id: string }> };

const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('folder-create'), name: authorNoteFolderNameSchema }),
  z.object({
    action: z.literal('folder-rename'),
    folderId: z.string().uuid(),
    name: authorNoteFolderNameSchema,
  }),
  z.object({ action: z.literal('folder-delete'), folderId: z.string().uuid() }),
  z.object({
    action: z.literal('note-create'),
    folderId: z.string().uuid().nullable().default(null),
    kind: z.enum(AUTHOR_NOTE_KINDS),
    title: authorNoteTitleSchema,
  }),
]);

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!(await getProject(db, id))) {
    return Response.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return Response.json(listAuthorNotebook(db, id));
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!(await getProject(db, id))) {
      return Response.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    const body = mutationSchema.parse(await request.json());
    if (body.action === 'folder-create') {
      createAuthorNoteFolder(db, id, body.name);
    } else if (body.action === 'folder-rename') {
      renameAuthorNoteFolder(db, id, body.folderId, body.name);
    } else if (body.action === 'folder-delete') {
      deleteAuthorNoteFolder(db, id, body.folderId);
    } else {
      createAuthorNote(db, id, body);
    }
    return Response.json(listAuthorNotebook(db, id));
  } catch (error) {
    return authorNotebookFailure(error);
  }
}
