import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProject } from '@/lib/db/queries/projects';
import { deleteWorldCategory, renameWorldCategory, WorldCategoryDeleteError, WorldCategoryRenameError } from '@/lib/db/queries/world-categories';
import { DELETE, PATCH } from './route';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn() }));
vi.mock('@/lib/db/queries/world-categories', () => ({ deleteWorldCategory: vi.fn(), renameWorldCategory: vi.fn(), createWorldCategory: vi.fn(), listWorldCategories: vi.fn(), WorldCategoryRenameError: class extends Error {}, WorldCategoryDeleteError: class extends Error {} }));
const params = { params: Promise.resolve({ id: 'project' }) };
const request = (body: unknown) => new Request('http://localhost/api/test', { method: 'PATCH', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getProject).mockResolvedValue({ id: 'project' } as never); });
describe('world category rename API', () => {
  it('validates and normalizes the new name before renaming', async () => {
    vi.mocked(renameWorldCategory).mockResolvedValue({ name: '지역', categories: [], updatedEntries: 2, updatedSuggestions: 1 });
    expect((await PATCH(request({ oldName: '장소', name: ' 지역 ' }), params)).status).toBe(200);
    expect(renameWorldCategory).toHaveBeenCalledWith({}, 'project', '장소', '지역');
  });
  it.each(['', 'x'.repeat(51), '이름\n다른 줄'])('rejects an invalid name %s', async (name) => {
    expect((await PATCH(request({ oldName: '장소', name }), params)).status).toBe(400);
    expect(renameWorldCategory).not.toHaveBeenCalled();
  });
  it('returns 404 for another or missing project', async () => {
    vi.mocked(getProject).mockResolvedValue(undefined);
    expect((await PATCH(request({ oldName: '장소', name: '지역' }), params)).status).toBe(404);
    expect(renameWorldCategory).not.toHaveBeenCalled();
  });
  it('returns a conflict instead of overwriting another category', async () => {
    vi.mocked(renameWorldCategory).mockRejectedValue(new WorldCategoryRenameError('이미 사용 중'));
    expect((await PATCH(request({ oldName: '장소', name: '물건' }), params)).status).toBe(409);
  });
});

describe('world category delete API', () => {
  it('requires an explicit destination and rejects malformed input', async () => {
    expect((await DELETE(request({ name: '장소' }), params)).status).toBe(400);
    expect((await DELETE(request({ name: '장소', targetName: '' }), params)).status).toBe(400);
    expect(deleteWorldCategory).not.toHaveBeenCalled();
  });
  it('performs a project-scoped move and deletion', async () => {
    vi.mocked(deleteWorldCategory).mockResolvedValue({ name: '장소', targetName: '기타', categories: [], updatedEntries: 1, updatedSuggestions: 0 });
    expect((await DELETE(request({ name: '장소', targetName: '기타' }), params)).status).toBe(200);
    expect(deleteWorldCategory).toHaveBeenCalledWith({}, 'project', '장소', '기타');
  });
  it('does not mutate a missing project', async () => {
    vi.mocked(getProject).mockResolvedValue(undefined);
    expect((await DELETE(request({ name: '장소', targetName: '기타' }), params)).status).toBe(404);
    expect(deleteWorldCategory).not.toHaveBeenCalled();
  });
  it('reports a conflict without hiding the failure', async () => {
    vi.mocked(deleteWorldCategory).mockRejectedValue(new WorldCategoryDeleteError('다른 카테고리를 선택해주세요.'));
    expect((await DELETE(request({ name: '장소', targetName: '기타' }), params)).status).toBe(409);
  });
});
