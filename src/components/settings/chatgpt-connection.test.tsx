import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatGPTConnection } from './chatgpt-connection';

describe('ChatGPT connection settings', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('presents only the official device login and never asks for passwords or API keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url === '/api/global-ai-settings') return Response.json({ providers: [] });
      return Response.json(init?.method === 'POST'
        ? { connected: false, models: [], login: { userCode: 'TEST-1234', verificationUrl: 'https://auth.openai.com/codex/device', expiresAt: Date.now() + 60000 } }
        : { connected: false, models: [] });
    }));
    render(<ChatGPTConnection />);
    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT로 로그인' }));
    await screen.findByText('TEST-1234');
    expect(screen.getByRole('link', { name: 'OpenAI 공식 로그인 열기' })).toHaveAttribute('href', 'https://auth.openai.com/codex/device');
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
  it('adds a separate provider without changing the old API row', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/chatgpt-account') return Response.json({ connected: true, models: [{ id: 'available-model', name: 'Available Model', isDefault: true }], email: 'test@example.invalid' });
      if (init?.method === 'POST') return Response.json({ id: 'new-chatgpt-provider' });
      return Response.json({ providers: [{ id: 'existing-api', providerType: 'openai' }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatGPTConnection />);
    await screen.findByText(/test@example.invalid/);
    fireEvent.click(screen.getByRole('button', { name: '공통 기본 AI로 사용' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
    const call = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')!;
    expect(JSON.parse(call[1].body)).toEqual({ providerType: 'chatgpt', modelName: 'available-model', isDefault: true, contextSize: 32768 });
    expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(false);
  });
});
