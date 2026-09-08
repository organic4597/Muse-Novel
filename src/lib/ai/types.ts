export const PROVIDER_TYPES = ['ollama', 'nvidia', 'openai', 'anthropic', 'koboldcpp', 'qwen-local', 'openai-compatible', 'opencode-oauth'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export interface ProviderConfig {
  provider: ProviderType;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  contextSize?: number;
  /** Ollama-specific: 'chat' uses ollama(modelId), 'completion' uses ollama.completion(modelId). Defaults to 'completion' for Ollama. */
  mode?: 'chat' | 'completion';
}
