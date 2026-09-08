import { and, asc, desc, eq } from 'drizzle-orm';

import type { AuthorNoteKind } from '@/lib/author-notebook';
import { defaultAuthorNoteContent } from '@/lib/author-notebook';
import type { DB } from '@/lib/db';
import {
  authorNoteAssets,
  authorNoteFolders,
  authorNotes,
} from '@/lib/db/schema';

export class AuthorNotebookError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
  }
}

export function listAuthorNotebook(db: DB, projectId: string) {
  return {
    assets: db
      .select()
      .from(authorNoteAssets)
      .where(eq(authorNoteAssets.projectId, projectId))
      .orderBy(asc(authorNoteAssets.createdAt))
      .all(),
    folders: db
      .select()
      .from(authorNoteFolders)
      .where(eq(authorNoteFolders.projectId, projectId))
      .orderBy(asc(authorNoteFolders.order), asc(authorNoteFolders.createdAt))
      .all(),
    notes: db
      .select()
      .from(authorNotes)
      .where(eq(authorNotes.projectId, projectId))
      .orderBy(asc(authorNotes.order), asc(authorNotes.createdAt))
      .all(),
  };
}

export function getAuthorNote(db: DB, projectId: string, noteId: string) {
  return db
    .select()
    .from(authorNotes)
    .where(and(eq(authorNotes.projectId, projectId), eq(authorNotes.id, noteId)))
    .get();
}

export function createAuthorNoteFolder(db: DB, projectId: string, name: string) {
  const last = db
    .select({ order: authorNoteFolders.order })
    .from(authorNoteFolders)
    .where(eq(authorNoteFolders.projectId, projectId))
    .orderBy(desc(authorNoteFolders.order))
    .limit(1)
    .get();
  return db
    .insert(authorNoteFolders)
    .values({ projectId, name, order: (last?.order ?? 0) + 1 })
    .returning()
    .get();
}

export function assertAuthorNoteFolder(
  db: DB,
  projectId: string,
  folderId: string | null
) {
  if (!folderId) return;
  const folder = db
    .select({ id: authorNoteFolders.id })
    .from(authorNoteFolders)
    .where(
      and(
        eq(authorNoteFolders.projectId, projectId),
        eq(authorNoteFolders.id, folderId)
      )
    )
    .get();
  if (!folder) throw new AuthorNotebookError('작가 노트 폴더를 찾을 수 없습니다.', 404);
}

export function createAuthorNote(
  db: DB,
  projectId: string,
  data: { folderId: string | null; kind: AuthorNoteKind; title: string }
) {
  assertAuthorNoteFolder(db, projectId, data.folderId);
  const last = db
    .select({ order: authorNotes.order })
    .from(authorNotes)
    .where(eq(authorNotes.projectId, projectId))
    .orderBy(desc(authorNotes.order))
    .limit(1)
    .get();
  return db
    .insert(authorNotes)
    .values({
      projectId,
      folderId: data.folderId,
      title: data.title,
      kind: data.kind,
      contentJson: JSON.stringify(defaultAuthorNoteContent(data.kind)),
      order: (last?.order ?? 0) + 1,
    })
    .returning()
    .get();
}

export function renameAuthorNoteFolder(
  db: DB,
  projectId: string,
  folderId: string,
  name: string
) {
  const folder = db
    .update(authorNoteFolders)
    .set({ name, updatedAt: new Date() })
    .where(
      and(
        eq(authorNoteFolders.projectId, projectId),
        eq(authorNoteFolders.id, folderId)
      )
    )
    .returning()
    .get();
  if (!folder) throw new AuthorNotebookError('작가 노트 폴더를 찾을 수 없습니다.', 404);
  return folder;
}

export function deleteAuthorNoteFolder(db: DB, projectId: string, folderId: string) {
  assertAuthorNoteFolder(db, projectId, folderId);
  db.delete(authorNoteFolders)
    .where(
      and(
        eq(authorNoteFolders.projectId, projectId),
        eq(authorNoteFolders.id, folderId)
      )
    )
    .run();
}

export function updateAuthorNote(
  db: DB,
  projectId: string,
  noteId: string,
  data: { contentJson?: string; folderId?: string | null; title?: string }
) {
  if (data.folderId !== undefined) {
    assertAuthorNoteFolder(db, projectId, data.folderId);
  }
  const note = db
    .update(authorNotes)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(authorNotes.projectId, projectId), eq(authorNotes.id, noteId)))
    .returning()
    .get();
  if (!note) throw new AuthorNotebookError('작가 노트를 찾을 수 없습니다.', 404);
  return note;
}

export function listAuthorNoteAssetPaths(db: DB, projectId: string, noteId: string) {
  return db
    .select({ imagePath: authorNoteAssets.imagePath })
    .from(authorNoteAssets)
    .where(
      and(
        eq(authorNoteAssets.projectId, projectId),
        eq(authorNoteAssets.noteId, noteId)
      )
    )
    .all()
    .map((asset) => asset.imagePath);
}

export function deleteAuthorNote(db: DB, projectId: string, noteId: string) {
  const imagePaths = listAuthorNoteAssetPaths(db, projectId, noteId);
  const deleted = db
    .delete(authorNotes)
    .where(and(eq(authorNotes.projectId, projectId), eq(authorNotes.id, noteId)))
    .returning({ id: authorNotes.id })
    .get();
  if (!deleted) throw new AuthorNotebookError('작가 노트를 찾을 수 없습니다.', 404);
  return imagePaths;
}

export function addAuthorNoteAsset(
  db: DB,
  projectId: string,
  noteId: string,
  imagePath: string
) {
  if (!getAuthorNote(db, projectId, noteId)) {
    throw new AuthorNotebookError('작가 노트를 찾을 수 없습니다.', 404);
  }
  return db
    .insert(authorNoteAssets)
    .values({ projectId, noteId, imagePath })
    .returning()
    .get();
}

export function authorNotebookFailure(error: unknown) {
  if (error instanceof AuthorNotebookError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json(
    { error: '작가 노트 요청을 처리하지 못했습니다.' },
    { status: 400 }
  );
}
