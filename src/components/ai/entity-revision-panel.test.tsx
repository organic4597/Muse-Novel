import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityRevisionPanel } from './entity-revision-panel';

const version = 'a'.repeat(64);
const initial = { snapshot: { title: '소림사', content: '기존 내용' }, version, revisions: [{ id: 1, reason: '수동 수정 전', createdAt: '2026-09-05T00:00:00Z' }], hasMore: false };
const proposal = { before: initial.snapshot, changes: { title: '새 이름', content: '보강된 내용', researchJson: null }, baseVersion: version };
afterEach(() => vi.unstubAllGlobals());
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'AI로 수정 · 수정 이력' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '이력 새로고침' })).not.toBeDisabled());
}
async function propose() {
  fireEvent.change(screen.getByLabelText('기존 설정 수정 요청'), { target: { value: '요청한 설명만 보강해줘' } });
  fireEvent.click(screen.getByRole('button', { name: '수정안 생성' }));
  await screen.findByRole('heading', { name: '변경 전·후 검토' });
}
describe('review before saving an existing entity', () => {
  it('does not call APIs while collapsed or save anything until selected changes are approved', async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json(proposal))
      .mockResolvedValueOnce(Response.json({ entry: { id: 'entry', title: '소림사', content: '보강된 내용' } })).mockResolvedValueOnce(Response.json(initial));
    vi.stubGlobal('fetch', fetchMock);
    render(<EntityRevisionPanel entityId="entry" kind="world" onSaved={onSaved} projectId="project" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await open(); await propose();
    expect(onSaved).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('checkbox', { name: '제목' }));
    fireEvent.click(screen.getByRole('button', { name: '선택한 수정 승인·저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: 'apply', baseVersion: version, changes: { content: '보강된 내용', researchJson: null } });
  });
  it('can discard a proposal without changing stored data', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json(proposal));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<EntityRevisionPanel entityId="entry" kind="world" onSaved={onSaved} projectId="project" />);
    await open(); await propose();
    fireEvent.click(screen.getByRole('button', { name: '반영하지 않기' }));
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '변경 전·후 검토' })).not.toBeInTheDocument();
  });
  it('previews a historical version before explicitly restoring it', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json({ ...proposal, revisionId: 1 }))
      .mockResolvedValueOnce(Response.json({ entry: { id: 'entry', content: '옛 내용' } })).mockResolvedValueOnce(Response.json(initial));
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    render(<EntityRevisionPanel entityId="entry" kind="world" onSaved={onSaved} projectId="project" />);
    await open(); fireEvent.click(screen.getByRole('button', { name: '복원 내용 확인' }));
    await screen.findByRole('heading', { name: '이력 #1 복원 검토' });
    expect(onSaved).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0]).toContain('?revisionId=1');
    fireEvent.click(screen.getByRole('button', { name: '이 버전으로 복원' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({ action: 'restore', revisionId: 1, baseVersion: version });
  });
  it('keeps the review visible on conflicts instead of reporting a successful save', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json(proposal))
      .mockResolvedValueOnce(Response.json({ error: '검토 중 이 항목이 변경되었습니다.' }, { status: 409 })));
    const onSaved = vi.fn();
    render(<EntityRevisionPanel entityId="entry" kind="world" onSaved={onSaved} projectId="project" />);
    await open(); await propose(); fireEvent.click(screen.getByRole('button', { name: '선택한 수정 승인·저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('검토 중');
    expect(onSaved).not.toHaveBeenCalled();
    expect(within(screen.getByRole('heading', { name: '변경 전·후 검토' }).parentElement!).getByRole('button', { name: '반영하지 않기' })).toBeInTheDocument();
  });
});
