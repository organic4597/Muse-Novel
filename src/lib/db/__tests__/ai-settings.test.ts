import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decryptApiKey, encryptApiKey, maskApiKey } from '@/lib/ai/encryption';
import {
  deleteProvider,
  getDefaultProvider,
  listProviders,
  setProvider,
  updateProvider,
} from '../queries/ai-settings';
import { createProject } from '../queries/projects';
import * as schema from '../schema';

describe('AI Settings Queries', () => {
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
    sqlite.exec('DELETE FROM ai_provider_settings');
    sqlite.exec('DELETE FROM projects');
    const project = await createProject(db, { title: 'AI 설정 테스트' });
    projectId = project.id;
  });

  afterEach(() => {
    // Ensure clean state
  });

  describe('setProvider', () => {
    it('should create a provider with encrypted API key', async () => {
      const apiKey = 'sk-test-key-12345';
      const encrypted = encryptApiKey(apiKey);

      const provider = await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        apiKeyEncrypted: encrypted,
        isDefault: true,
      });

      expect(provider).toBeDefined();
      expect(provider.providerType).toBe('openai');
      expect(provider.modelName).toBe('gpt-4o');
      expect(provider.apiKeyEncrypted).toBe(encrypted);
      expect(provider.isDefault).toBe(1);
      // Verify round-trip decryption
      expect(decryptApiKey(provider.apiKeyEncrypted!)).toBe(apiKey);
    });

    it('should create a provider without API key (Ollama)', async () => {
      const provider = await setProvider(db, projectId, {
        providerType: 'ollama',
        modelName: 'llama3.2',
        baseUrl: 'http://localhost:11434',
        isDefault: false,
      });

      expect(provider).toBeDefined();
      expect(provider.providerType).toBe('ollama');
      expect(provider.apiKeyEncrypted).toBeNull();
      expect(provider.baseUrl).toBe('http://localhost:11434');
    });

    it('should unset other defaults when setting a new default', async () => {
      await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: true,
      });

      await setProvider(db, projectId, {
        providerType: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        isDefault: true,
      });

      const providers = await listProviders(db, projectId);
      const defaults = providers.filter((p) => p.isDefault === 1);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].providerType).toBe('anthropic');
    });
  });

  describe('listProviders', () => {
    it('should return all providers for a project', async () => {
      await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: true,
      });
      await setProvider(db, projectId, {
        providerType: 'ollama',
        modelName: 'llama3.2',
        isDefault: false,
      });

      const providers = await listProviders(db, projectId);
      expect(providers).toHaveLength(2);
    });

    it('should return empty array for project with no providers', async () => {
      const providers = await listProviders(db, projectId);
      expect(providers).toHaveLength(0);
    });

    it('should not return providers from other projects', async () => {
      const otherProject = await createProject(db, { title: '다른 프로젝트' });

      await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: true,
      });
      await setProvider(db, otherProject.id, {
        providerType: 'anthropic',
        modelName: 'claude-sonnet-4-20250514',
        isDefault: true,
      });

      const providers = await listProviders(db, projectId);
      expect(providers).toHaveLength(1);
      expect(providers[0].providerType).toBe('openai');
    });
  });

  describe('getDefaultProvider', () => {
    it('should return the default provider', async () => {
      await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: true,
      });
      await setProvider(db, projectId, {
        providerType: 'ollama',
        modelName: 'llama3.2',
        isDefault: false,
      });

      const defaultProvider = await getDefaultProvider(db, projectId);
      expect(defaultProvider).toBeDefined();
      expect(defaultProvider!.providerType).toBe('openai');
    });

    it('should return undefined when no default is set', async () => {
      await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: false,
      });

      const defaultProvider = await getDefaultProvider(db, projectId);
      expect(defaultProvider).toBeUndefined();
    });
  });

  describe('updateProvider', () => {
    it('should update model name', async () => {
      const provider = await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: false,
      });

      const updated = await updateProvider(db, provider.id, {
        modelName: 'gpt-4o-mini',
      });

      expect(updated).toBeDefined();
      expect(updated!.modelName).toBe('gpt-4o-mini');
      expect(updated!.providerType).toBe('openai');
    });

    it('should update API key with new encrypted value', async () => {
      const originalKey = 'sk-original-key';
      const provider = await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        apiKeyEncrypted: encryptApiKey(originalKey),
        isDefault: false,
      });

      const newKey = 'sk-new-key-updated';
      const updated = await updateProvider(db, provider.id, {
        apiKeyEncrypted: encryptApiKey(newKey),
      });

      expect(updated).toBeDefined();
      expect(decryptApiKey(updated!.apiKeyEncrypted!)).toBe(newKey);
    });

    it('should return undefined for non-existent id', async () => {
      const updated = await updateProvider(db, 'nonexistent-id', {
        modelName: 'test',
      });
      expect(updated).toBeUndefined();
    });

    it('should toggle isDefault', async () => {
      const provider = await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: false,
      });

      const updated = await updateProvider(db, provider.id, {
        isDefault: true,
      });

      expect(updated).toBeDefined();
      expect(updated!.isDefault).toBe(1);
    });
  });

  describe('deleteProvider', () => {
    it('should delete a provider', async () => {
      const provider = await setProvider(db, projectId, {
        providerType: 'openai',
        modelName: 'gpt-4o',
        isDefault: false,
      });

      await deleteProvider(db, provider.id);

      const providers = await listProviders(db, projectId);
      expect(providers).toHaveLength(0);
    });
  });

  describe('encryption integration with masking', () => {
    it('should encrypt on save and mask for display', async () => {
      const apiKey = 'nvapi-test1234567890abcdef';
      const encrypted = encryptApiKey(apiKey);

      const provider = await setProvider(db, projectId, {
        providerType: 'nvidia',
        modelName: 'meta/llama-3.1-8b-instruct',
        apiKeyEncrypted: encrypted,
        isDefault: true,
      });

      // Stored value is encrypted (not plain text)
      expect(provider.apiKeyEncrypted).not.toBe(apiKey);
      expect(provider.apiKeyEncrypted).toContain(':');

      // Decrypted value matches original
      expect(decryptApiKey(provider.apiKeyEncrypted!)).toBe(apiKey);

      // Masked value for display
      const masked = maskApiKey(apiKey);
      expect(masked).toBe('nvapi****def');
      expect(masked).not.toBe(apiKey);
    });

    it('should handle provider without API key gracefully', async () => {
      const provider = await setProvider(db, projectId, {
        providerType: 'ollama',
        modelName: 'llama3.2',
        isDefault: false,
      });

      expect(provider.apiKeyEncrypted).toBeNull();
      expect(maskApiKey('')).toBe('');
    });
  });
});
