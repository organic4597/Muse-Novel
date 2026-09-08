import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { GhostAISettings } from './ghost-ai-settings';

describe('GhostAISettings local-only connection', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows Ghost as disabled without a dedicated setting and never offers cloud inheritance', async () => {
    const fetchMock = vi.fn(async (_url, init) => init?.method === 'PUT'
      ? Response.json({ providerType: 'qwen-local', modelName: 'Kanana-Ghost', baseUrl: 'http://127.0.0.1:8080' })
      : Response.json({ override: null }));
    vi.stubGlobal('fetch', fetchMock);
    render(<GhostAISettings projectId="project" />);
    await screen.findByText(/Ghost Text 요청이 비활성화/);
    expect(screen.queryByText('Story 제공자와 같은 연결 사용')).not.toBeInTheDocument();
    const provider = screen.getByLabelText('제공자') as HTMLSelectElement;
    expect([...provider.options].map(option => option.value)).toEqual(['qwen-local', 'openai-compatible', 'ollama', 'koboldcpp']);
    fireEvent.change(screen.getByLabelText('모델 ID'), { target: { value: 'Kanana-Ghost' } });
    fireEvent.click(screen.getByRole('button', { name: '전용 로컬 연결 저장' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(true));
    const save = fetchMock.mock.calls.find(call => call[1]?.method === 'PUT')![1];
    expect(JSON.parse(String(save.body))).toMatchObject({ providerType: 'qwen-local', modelName: 'Kanana-Ghost', baseUrl: 'http://127.0.0.1:8080' });
  });
});
