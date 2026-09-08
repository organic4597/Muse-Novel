import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import { openCodeOAuthFetch } from './opencode-oauth';

export function createOpenCodeOAuthProvider(modelId: string): LanguageModelV3 {
  const provider = createOpenAI({
    name: 'opencode-oauth', apiKey: 'oauth-managed-by-muse-novel', baseURL: 'https://api.openai.com/v1', fetch: openCodeOAuthFetch,
  });
  return provider.responses(modelId);
}
