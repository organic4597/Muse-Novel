import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createAuthorNote,
  createAuthorNoteFolder,
  deleteAuthorNote,
  deleteAuthorNoteFolder,
  getAuthorNote,
  listAuthorNotebook,
  updateAuthorNote,
} from '../queries/author-notebook';
import { createProject } from '../queries/projects';
import * as schema from '../schema';

describe('author notebook queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;

  beforeAll(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM projects');
    projectId = (await createProject(db, { title: '작가 노트 테스트' })).id;
  });

  it('creates folders and typed notes in stable order', () => {
    const folder = createAuthorNoteFolder(db, projectId, '1막 구상');
    const text = createAuthorNote(db, projectId, {
      folderId: folder.id,
      kind: 'text',
      title: '핵심 갈등',
    });
    const mindmap = createAuthorNote(db, projectId, {
      folderId: folder.id,
      kind: 'mindmap',
      title: '세력 관계도',
    });

    const notebook = listAuthorNotebook(db, projectId);
    expect(notebook.folders).toHaveLength(1);
    expect(notebook.notes.map((note) => note.id)).toEqual([
      text.id,
      mindmap.id,
    ]);
    expect(JSON.parse(text.contentJson)).toEqual({ text: '' });
    expect(JSON.parse(mindmap.contentJson)).toEqual({ edges: [], nodes: [] });
  });

  it('preserves notes as unfiled when a folder is deleted', () => {
    const folder = createAuthorNoteFolder(db, projectId, '임시 폴더');
    const note = createAuthorNote(db, projectId, {
      folderId: folder.id,
      kind: 'text',
      title: '보존할 노트',
    });

    deleteAuthorNoteFolder(db, projectId, folder.id);

    expect(getAuthorNote(db, projectId, note.id)?.folderId).toBeNull();
  });

  it('updates content and deletes only the selected note', () => {
    const first = createAuthorNote(db, projectId, {
      folderId: null,
      kind: 'text',
      title: '첫 노트',
    });
    const second = createAuthorNote(db, projectId, {
      folderId: null,
      kind: 'text',
      title: '둘째 노트',
    });
    updateAuthorNote(db, projectId, first.id, {
      contentJson: JSON.stringify({ text: '전체 플롯 메모' }),
    });

    expect(JSON.parse(getAuthorNote(db, projectId, first.id)!.contentJson)).toEqual({
      text: '전체 플롯 메모',
    });
    expect(deleteAuthorNote(db, projectId, first.id)).toEqual([]);
    expect(getAuthorNote(db, projectId, first.id)).toBeUndefined();
    expect(getAuthorNote(db, projectId, second.id)).toBeDefined();
  });
});
