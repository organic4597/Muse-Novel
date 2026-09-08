import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneWorkbench } from './scene-workbench';
import { EMPTY_SCENE } from '@/lib/writing-workbench';
describe('scene workbench author decisions', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not save an inferred scene before the author confirms it', async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (!init?.body) return Response.json({ scenes: [], examples: [] });
      const body = JSON.parse(String(init.body));
      if (body.action === 'draft-scene') return Response.json({ plan: { ...EMPTY_SCENE, viewpoint: '무림인' } });
      return Response.json({ id: 'scene', title: body.title, revision: 1, status: body.status });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SceneWorkbench projectId="project" chapterId="chapter" sceneId={null} onSceneChange={vi.fn()}
      getContent={async () => '[]'} getSelection={() => ''} />);
    fireEvent.click(screen.getByRole('button', { name: '원고에서 장면 초안 만들기' }));
    expect(await screen.findByDisplayValue('무림인')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([_url, init]) => String(init?.body).includes('save-scene'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '설계 확정' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([_url, init]) => {
      const body = JSON.parse(String(init?.body ?? '{}')); return body.action === 'save-scene' && body.status === 'confirmed';
    })).toBe(true));
  });
});
