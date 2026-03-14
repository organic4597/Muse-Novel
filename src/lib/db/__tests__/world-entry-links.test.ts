import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../schema';
import {
  createLink,
  deleteLink,
  getLinksForEntry,
  searchWorldEntries,
} from '../queries/world-entry-links';
import { createWorldEntry } from '../queries/world-entries';
import { createProject } from '../queries/projects';

describe('World Entry Link Queries', () => {
  let sqlite: InstanceType<typeof Database>;
  let db: import('@/lib/db').DB;
  let projectId: string;
  let entryA: { id: string; title: string };
  let entryB: { id: string; title: string };
  let entryC: { id: string; title: string };

  beforeAll(async () => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: './drizzle' });
  });

  beforeEach(async () => {
    sqlite.exec('DELETE FROM world_entry_links');
    sqlite.exec('DELETE FROM world_entry_tags');
    sqlite.exec('DELETE FROM world_entries');
    sqlite.exec('DELETE FROM projects');

    const project = await createProject(db, { title: '링크 테스트 소설' });
    projectId = project.id;

    const a = await createWorldEntry(db, {
      projectId,
      category: '장소',
      title: '마법의 숲',
      content: '고대 마법이 깃든 신비로운 숲',
    });
    entryA = { id: a.id, title: a.title };

    const b = await createWorldEntry(db, {
      projectId,
      category: '인물',
      title: '대마법사',
      content: '마법의 숲을 지키는 수호자',
    });
    entryB = { id: b.id, title: b.title };

    const c = await createWorldEntry(db, {
      projectId,
      category: '아이템',
      title: '마법 지팡이',
      content: '대마법사의 지팡이로 엄청난 힘을 지님',
    });
    entryC = { id: c.id, title: c.title };
  });

  describe('createLink', () => {
    it('should create a unidirectional link from source to target', async () => {
      const link = await createLink(db, entryA.id, entryB.id);

      expect(link).toBeDefined();
      expect(link.id).toBeDefined();
      expect(link.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(link.sourceId).toBe(entryA.id);
      expect(link.targetId).toBe(entryB.id);
      expect(link.createdAt).toBeInstanceOf(Date);
    });

    it('should throw when creating self-link', async () => {
      await expect(createLink(db, entryA.id, entryA.id)).rejects.toThrow();
    });

    it('should allow creating multiple outgoing links from same source', async () => {
      await createLink(db, entryA.id, entryB.id);
      await createLink(db, entryA.id, entryC.id);

      const links = await getLinksForEntry(db, entryA.id);
      expect(links.outgoing).toHaveLength(2);
    });

    it('should NOT auto-create reverse link (unidirectional)', async () => {
      await createLink(db, entryA.id, entryB.id);

      const linksForB = await getLinksForEntry(db, entryB.id);
      expect(linksForB.outgoing).toHaveLength(0);
      expect(linksForB.incoming).toHaveLength(1);
    });
  });

  describe('getLinksForEntry', () => {
    it('should return outgoing links with target title', async () => {
      await createLink(db, entryA.id, entryB.id);

      const links = await getLinksForEntry(db, entryA.id);

      expect(links.outgoing).toHaveLength(1);
      expect(links.outgoing[0].targetId).toBe(entryB.id);
      expect(links.outgoing[0].targetTitle).toBe('대마법사');
      expect(links.outgoing[0].id).toBeDefined();
      expect(links.outgoing[0].createdAt).toBeInstanceOf(Date);
    });

    it('should return incoming backlinks with source title', async () => {
      await createLink(db, entryA.id, entryB.id);

      const links = await getLinksForEntry(db, entryB.id);

      expect(links.incoming).toHaveLength(1);
      expect(links.incoming[0].sourceId).toBe(entryA.id);
      expect(links.incoming[0].sourceTitle).toBe('마법의 숲');
      expect(links.incoming[0].id).toBeDefined();
      expect(links.incoming[0].createdAt).toBeInstanceOf(Date);
    });

    it('should return both outgoing and incoming for an entry', async () => {
      // A → B, C → B
      await createLink(db, entryA.id, entryB.id);
      await createLink(db, entryC.id, entryB.id);

      const links = await getLinksForEntry(db, entryB.id);

      expect(links.outgoing).toHaveLength(0);
      expect(links.incoming).toHaveLength(2);

      const sourceTitles = links.incoming.map((l) => l.sourceTitle);
      expect(sourceTitles).toContain('마법의 숲');
      expect(sourceTitles).toContain('마법 지팡이');
    });

    it('should return empty arrays when no links exist', async () => {
      const links = await getLinksForEntry(db, entryA.id);

      expect(links.outgoing).toEqual([]);
      expect(links.incoming).toEqual([]);
    });

    it('should handle entry with both outgoing and incoming links', async () => {
      // A → B, B → C
      await createLink(db, entryA.id, entryB.id);
      await createLink(db, entryB.id, entryC.id);

      const links = await getLinksForEntry(db, entryB.id);

      expect(links.outgoing).toHaveLength(1);
      expect(links.outgoing[0].targetTitle).toBe('마법 지팡이');
      expect(links.incoming).toHaveLength(1);
      expect(links.incoming[0].sourceTitle).toBe('마법의 숲');
    });
  });

  describe('deleteLink', () => {
    it('should delete a link by id', async () => {
      const link = await createLink(db, entryA.id, entryB.id);

      await deleteLink(db, link.id);

      const links = await getLinksForEntry(db, entryA.id);
      expect(links.outgoing).toHaveLength(0);
    });

    it('should only delete the specified link', async () => {
      const link1 = await createLink(db, entryA.id, entryB.id);
      await createLink(db, entryA.id, entryC.id);

      await deleteLink(db, link1.id);

      const links = await getLinksForEntry(db, entryA.id);
      expect(links.outgoing).toHaveLength(1);
      expect(links.outgoing[0].targetTitle).toBe('마법 지팡이');
    });

    it('should not throw for non-existent id', async () => {
      await expect(
        deleteLink(db, 'non-existent-id')
      ).resolves.not.toThrow();
    });

    it('should remove backlink when source link is deleted', async () => {
      const link = await createLink(db, entryA.id, entryB.id);

      await deleteLink(db, link.id);

      const linksForB = await getLinksForEntry(db, entryB.id);
      expect(linksForB.incoming).toHaveLength(0);
    });
  });

  describe('searchWorldEntries', () => {
    it('should find entries by title match', async () => {
      const results = await searchWorldEntries(db, projectId, '마법');

      expect(results.length).toBeGreaterThanOrEqual(2);
      const titles = results.map((r) => r.title);
      expect(titles).toContain('마법의 숲');
      expect(titles).toContain('마법 지팡이');
    });

    it('should find entries by content match', async () => {
      const results = await searchWorldEntries(db, projectId, '수호자');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('대마법사');
    });

    it('should return empty array for no matches', async () => {
      const results = await searchWorldEntries(db, projectId, '존재하지않는검색어');

      expect(results).toEqual([]);
    });

    it('should only search within the given project', async () => {
      const otherProject = await createProject(db, { title: '다른 소설' });
      await createWorldEntry(db, {
        projectId: otherProject.id,
        category: '장소',
        title: '마법 학교',
      });

      const results = await searchWorldEntries(db, projectId, '마법');

      // Should NOT include the entry from the other project
      const titles = results.map((r) => r.title);
      expect(titles).not.toContain('마법 학교');
    });

    it('should match partial strings', async () => {
      const results = await searchWorldEntries(db, projectId, '신비로운');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('마법의 숲');
    });

    it('should match content with partial strings', async () => {
      const results = await searchWorldEntries(db, projectId, '엄청난');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('마법 지팡이');
    });
  });
});
