import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeOAuthConnection } from './opencode-oauth-connection';

describe('OpenCode OAuth settings', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('shows the one-time OpenAI code without accepting passwords or raw tokens', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (url === '/api/global-ai-settings') return Response.json({ providers: [] });
      return Response.json(init?.method === 'POST'
        ? { connected: false, models: [], login: { userCode: 'TEST-CODE', verificationUrl: 'https://auth.openai.com/codex/device', expiresAt: Date.now() + 60000 } }
        : { connected: false, models: [] });
    }));
    render(<OpenCodeOAuthConnection />);
    fireEvent.click(screen.getByRole('button', { name: 'ChatGPT로 로그인' }));
    await screen.findByText('TEST-CODE');
    expect(screen.getByRole('link', { name: 'OpenAI 로그인 열기' })).toHaveAttribute('href', 'https://auth.openai.com/codex/device');
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
  it('adds a separate default while preserving existing API provider rows', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (url === '/api/opencode-oauth-account') return Response.json({ connected: true, email: 'writer@example.invalid', models: [{ id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', isDefault: true }] });
      if (init?.method === 'POST') return Response.json({ id: 'oauth-provider' });
      return Response.json({ providers: [{ id: 'existing-api', providerType: 'openai' }] });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<OpenCodeOAuthConnection />);
    await screen.findByText(/writer@example.invalid/);
    fireEvent.click(screen.getByRole('button', { name: '공통 기본 AI로 사용' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[1]?.method === 'POST')).toBe(true));
    const request = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')![1];
    expect(JSON.parse(String(request.body))).toMatchObject({ providerType: 'opencode-oauth', modelName: 'gpt-5.4-mini', isDefault: true });
    expect(fetchMock.mock.calls.some(call => call[1]?.method === 'PUT')).toBe(false);
  });
});
