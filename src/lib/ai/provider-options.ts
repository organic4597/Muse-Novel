import type { ProviderOptions } from '@ai-sdk/provider-utils';

import type { ProviderConfig } from './types';

export function getProviderOptions(
  config: ProviderConfig
): ProviderOptions | undefined {
  if (config.provider !== 'ollama' || !config.contextSize) {
    return undefined;
  }

  return {
    ollama: {
      options: {
        num_ctx: config.contextSize,
      },
    },
  } satisfies ProviderOptions;
}