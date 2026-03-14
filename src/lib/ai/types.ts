export type ProviderType = 'ollama' | 'nvidia' | 'openai' | 'anthropic' | 'koboldcpp' | 'qwen-local';

export interface ProviderConfig {
  provider: ProviderType;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  contextSize?: number;
  /** Ollama-specific: 'chat' uses ollama(modelId), 'completion' uses ollama.completion(modelId). Defaults to 'completion' for Ollama. */
  mode?: 'chat' | 'completion';
}
