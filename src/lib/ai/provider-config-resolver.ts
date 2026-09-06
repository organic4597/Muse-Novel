import type { ProviderConfig, ProviderType } from './types';

type StoredProviderSettings = {
  providerType: string;
  modelName: string | null;
  apiKeyEncrypted: string | null;
  baseUrl: string | null;
  contextSize: number | null;
};

type ResolveProviderConfigOptions = {
  decryptApiKey: (encrypted: string) => string;
};

function isLegacyDolphinModel(modelName: string | null): boolean {
  if (!modelName) {
    return false;
  }

  const normalized = modelName.toLowerCase();
  return normalized.includes('dolphin') || normalized.includes('mistral-24b');
}

export function resolveStoredProviderConfig(
  settings: StoredProviderSettings,
  options: ResolveProviderConfigOptions
): ProviderConfig {
  if (settings.providerType === 'ollama' && isLegacyDolphinModel(settings.modelName)) {
    return {
      provider: 'qwen-local',
      modelId: process.env.QLORA_BASE_MODEL ?? 'Qwen/Qwen3.5-9B-Base',
      baseUrl: process.env.QWEN_LOCAL_URL ?? 'http://localhost:8321',
      contextSize: settings.contextSize ?? 49152,
    };
  }

  return {
    provider: settings.providerType as ProviderType,
    modelId: settings.modelName || 'gpt-4o-mini',
    apiKey: settings.apiKeyEncrypted
      ? options.decryptApiKey(settings.apiKeyEncrypted)
      : undefined,
    baseUrl: settings.baseUrl ?? undefined,
    contextSize: settings.contextSize ?? undefined,
  };
}
