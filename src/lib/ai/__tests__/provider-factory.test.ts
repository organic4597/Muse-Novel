import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '@/lib/db/schema';
import type { ProviderConfig } from '../types';

// ─── Mock AI SDK modules ────────────────────────────────────────────────────

const mockLanguageModel = { modelId: 'mock-model', provider: 'mock' };

const mockOllamaCompletion = vi.fn(() => mockLanguageModel);
const mockOllamaProvider = {
  chat: vi.fn(() => mockLanguageModel),
  completion: mockOllamaCompletion,
};

vi.mock('ollama-ai-provider-v2', () => ({
  createOllama: vi.fn(() => mockOllamaProvider),
}));

const mockOpenAIChatModel = vi.fn(() => mockLanguageModel);
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => mockOpenAIChatModel),
}));

const mockAnthropicChatModel = vi.fn(() => mockLanguageModel);
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => mockAnthropicChatModel),
}));

const mockNvidiaChatModel = vi.fn(() => mockLanguageModel);
const mockNvidiaProvider = {
  chatModel: vi.fn(() => mockLanguageModel),
};
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible: vi.fn(() => mockNvidiaProvider),
}));

// ─── Provider Factory Tests ─────────────────────────────────────────────────

describe('createProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an OpenAI provider with apiKey', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createOpenAI } = await import('@ai-sdk/openai');

    const config: ProviderConfig = {
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: 'sk-test-key',
    };

    const model = createProvider(config);

    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test-key' });
    expect(mockOpenAIChatModel).toHaveBeenCalledWith('gpt-4o-mini');
    expect(model).toBe(mockLanguageModel);
  });

  it('creates an Anthropic provider with apiKey', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createAnthropic } = await import('@ai-sdk/anthropic');

    const config: ProviderConfig = {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-ant-test',
    };

    const model = createProvider(config);

    expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' });
    expect(mockAnthropicChatModel).toHaveBeenCalledWith('claude-sonnet-4-20250514');
    expect(model).toBe(mockLanguageModel);
  });

  it('creates an Ollama provider in completion mode by default', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createOllama } = await import('ollama-ai-provider-v2');

    const config: ProviderConfig = {
      provider: 'ollama',
      modelId: 'qwen2.5:14b',
      baseUrl: 'http://localhost:11434',
    };

    const model = createProvider(config);

    expect(createOllama).toHaveBeenCalledWith({
      baseURL: 'http://localhost:11434',
      compatibility: 'strict',
    });
    expect(mockOllamaCompletion).toHaveBeenCalledWith('qwen2.5:14b');
    expect(model).toBe(mockLanguageModel);
  });

  it('creates an Ollama provider in chat mode when specified', async () => {
    const { createProvider } = await import('../provider-factory');

    const config: ProviderConfig = {
      provider: 'ollama',
      modelId: 'llama3',
      mode: 'chat',
    };

    const model = createProvider(config);

    expect(mockOllamaProvider.chat).toHaveBeenCalledWith('llama3');
    expect(model).toBe(mockLanguageModel);
  });

  it('creates an NVIDIA provider with defaults', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

    const config: ProviderConfig = {
      provider: 'nvidia',
      modelId: 'nvidia/llama-3.1-nemotron-70b-instruct',
      apiKey: 'nvapi-test',
    };

    const model = createProvider(config);

    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'nvidia',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: 'nvapi-test',
    });
    expect(mockNvidiaProvider.chatModel).toHaveBeenCalledWith(
      'nvidia/llama-3.1-nemotron-70b-instruct'
    );
    expect(model).toBe(mockLanguageModel);
  });

  it('creates an NVIDIA provider with custom baseUrl', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

    const config: ProviderConfig = {
      provider: 'nvidia',
      modelId: 'some-model',
      apiKey: 'nvapi-test',
      baseUrl: 'https://custom.nvidia.api/v1',
    };

    createProvider(config);

    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: 'nvidia',
      baseURL: 'https://custom.nvidia.api/v1',
      apiKey: 'nvapi-test',
    });
  });

  it('maps fast Qwen requests to llama.cpp non-thinking mode', async () => {
    const { transformQwenRequestBody } = await import('../provider-factory');

    expect(transformQwenRequestBody({
      chat_template_kwargs: { custom: true },
      reasoning_effort: 'none',
      stream: true,
    })).toMatchObject({
      chat_template_kwargs: {
        custom: true,
        enable_thinking: false,
      },
      min_p: 0,
      reasoning_effort: 'none',
      stream: true,
      top_k: 20,
    });
  });

  it('throws descriptive error for unsupported provider', async () => {
    const { createProvider } = await import('../provider-factory');

    const config = {
      provider: 'gemini' as ProviderConfig['provider'],
      modelId: 'gemini-pro',
    };

    expect(() => createProvider(config)).toThrow(
      'Unsupported AI provider: gemini'
    );
  });

  it('uses a model-agnostic Chat Completions adapter without vendor-specific body transforms', async () => {
    const { createProvider } = await import('../provider-factory');
    const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
    for (const modelId of ['qwen-example', 'llama-example', 'another-model']) {
      createProvider({ provider: 'openai-compatible', modelId, baseUrl: 'http://inference.local:8080/v1/' });
      expect(mockNvidiaProvider.chatModel).toHaveBeenLastCalledWith(modelId);
      expect(createOpenAICompatible).toHaveBeenLastCalledWith({
        name: 'openai-compatible', baseURL: 'http://inference.local:8080/v1', apiKey: undefined,
      });
    }
  });
});

// ─── AI Settings Query Tests (in-memory SQLite) ────────────────────────────

describe('ai-settings queries', () => {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  migrate(db, { migrationsFolder: './drizzle' });

  // Insert a project to satisfy foreign key
  const projectId = 'test-project-id';

  beforeEach(() => {
    // Clear AI provider settings between tests
    sqlite.prepare('DELETE FROM ai_provider_settings').run();
    // Ensure project exists
    sqlite.prepare(
      'INSERT OR IGNORE INTO projects (id, title) VALUES (?, ?)'
    ).run(projectId, 'Test Project');
  });

  it('listProviders returns empty array when no settings exist', async () => {
    const { listProviders } = await import('@/lib/db/queries/ai-settings');
    const result = await listProviders(db, projectId);
    expect(result).toEqual([]);
  });

  it('setProvider inserts a new provider setting', async () => {
    const { setProvider, listProviders } = await import(
      '@/lib/db/queries/ai-settings'
    );

    const created = await setProvider(db, projectId, {
      providerType: 'openai',
      modelName: 'gpt-4o-mini',
      apiKeyEncrypted: 'encrypted-key',
      isDefault: true,
    });

    expect(created).toBeDefined();
    expect(created.providerType).toBe('openai');
    expect(created.modelName).toBe('gpt-4o-mini');
    expect(created.isDefault).toBe(1);

    const all = await listProviders(db, projectId);
    expect(all).toHaveLength(1);
  });

  it('setProvider with isDefault=true unsets other defaults', async () => {
    const { setProvider, listProviders } = await import(
      '@/lib/db/queries/ai-settings'
    );

    await setProvider(db, projectId, {
      providerType: 'openai',
      modelName: 'gpt-4o-mini',
      isDefault: true,
    });

    await setProvider(db, projectId, {
      providerType: 'anthropic',
      modelName: 'claude-sonnet-4-20250514',
      isDefault: true,
    });

    const all = await listProviders(db, projectId);
    expect(all).toHaveLength(2);

    const defaults = all.filter((p) => p.isDefault === 1);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].providerType).toBe('anthropic');
  });

  it('getDefaultProvider returns the default provider', async () => {
    const { setProvider, getDefaultProvider } = await import(
      '@/lib/db/queries/ai-settings'
    );

    await setProvider(db, projectId, {
      providerType: 'openai',
      modelName: 'gpt-4o',
      isDefault: false,
    });

    await setProvider(db, projectId, {
      providerType: 'anthropic',
      modelName: 'claude-sonnet-4-20250514',
      isDefault: true,
    });

    const defaultProvider = await getDefaultProvider(db, projectId);
    expect(defaultProvider).toBeDefined();
    expect(defaultProvider!.providerType).toBe('anthropic');
  });

  it('getDefaultProvider returns undefined when no default set', async () => {
    const { getDefaultProvider } = await import(
      '@/lib/db/queries/ai-settings'
    );

    const result = await getDefaultProvider(db, projectId);
    expect(result).toBeUndefined();
  });

  it('updateProvider updates fields', async () => {
    const { setProvider, updateProvider, listProviders } = await import(
      '@/lib/db/queries/ai-settings'
    );

    const created = await setProvider(db, projectId, {
      providerType: 'openai',
      modelName: 'gpt-4o-mini',
    });

    const updated = await updateProvider(db, created.id, {
      modelName: 'gpt-4o',
      baseUrl: 'https://custom-openai.com/v1',
    });

    expect(updated).toBeDefined();
    expect(updated!.modelName).toBe('gpt-4o');
    expect(updated!.baseUrl).toBe('https://custom-openai.com/v1');
  });

  it('updateProvider returns undefined for non-existent id', async () => {
    const { updateProvider } = await import(
      '@/lib/db/queries/ai-settings'
    );

    const result = await updateProvider(db, 'non-existent-id', {
      modelName: 'gpt-4o',
    });

    expect(result).toBeUndefined();
  });

  it('deleteProvider removes the setting', async () => {
    const { setProvider, deleteProvider, listProviders } = await import(
      '@/lib/db/queries/ai-settings'
    );

    const created = await setProvider(db, projectId, {
      providerType: 'ollama',
      modelName: 'llama3',
    });

    await deleteProvider(db, created.id);

    const all = await listProviders(db, projectId);
    expect(all).toHaveLength(0);
  });

  it('setProvider with baseUrl stores it correctly', async () => {
    const { setProvider, listProviders } = await import(
      '@/lib/db/queries/ai-settings'
    );

    await setProvider(db, projectId, {
      providerType: 'nvidia',
      modelName: 'nemotron-70b',
      baseUrl: 'https://custom.nvidia.api/v1',
      apiKeyEncrypted: 'enc-nvidia-key',
    });

    const all = await listProviders(db, projectId);
    expect(all).toHaveLength(1);
    expect(all[0].baseUrl).toBe('https://custom.nvidia.api/v1');
    expect(all[0].apiKeyEncrypted).toBe('enc-nvidia-key');
  });
});
