import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ project: vi.fn(), get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: mocks.project }));
vi.mock('@/lib/db/queries/ghost-ai-settings', () => ({ getGhostAISettings: mocks.get, setGhostAISettings: mocks.set, deleteGhostAISettings: mocks.remove }));
vi.mock('@/lib/ai/encryption', () => ({ decryptApiKey: vi.fn(value => value), encryptApiKey: vi.fn(value => `encrypted:${value}`), maskApiKey: vi.fn(() => 'masked') }));
import { DELETE, PUT } from './route';

describe('Ghost AI settings route isolation', () => {
  const context = { params: Promise.resolve({ id: 'project' }) };
  const request = (body: unknown) => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) });
  beforeEach(() => {
    vi.clearAllMocks(); mocks.project.mockResolvedValue({ id: 'project' }); mocks.get.mockResolvedValue(undefined);
    mocks.set.mockImplementation(async (_db, projectId, data) => ({ projectId, ...data, apiKeyEncrypted: null }));
  });
  it('accepts a private local model endpoint', async () => {
    const response = await PUT(request({ providerType: 'openai-compatible', modelName: 'ghost-moe', baseUrl: 'http://192.168.1.18:8080/v1', contextSize: 32768 }), context);
    expect(response.status).toBe(200); expect(mocks.set).toHaveBeenCalledOnce();
  });
  it.each([
    { providerType: 'opencode-oauth', modelName: 'gpt', baseUrl: 'http://127.0.0.1:8080' },
    { providerType: 'openai-compatible', modelName: 'cloud', baseUrl: 'https://api.openai.com/v1' },
  ])('rejects OAuth, cloud providers and public endpoints', async body => {
    expect((await PUT(request(body), context)).status).toBe(400); expect(mocks.set).not.toHaveBeenCalled();
  });
  it('deleting the dedicated setting disables Ghost instead of enabling inheritance', async () => {
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), context);
    expect(await response.json()).toEqual({ enabled: false, inherited: false }); expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
