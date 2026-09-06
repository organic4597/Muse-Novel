import type { ProviderOptions } from '@ai-sdk/provider-utils';

import type { ProviderConfig } from './types';

type ProviderOptionIntent = {
  disableReasoning?: boolean;
};

export function getProviderOptions(
  config: ProviderConfig,
  intent: ProviderOptionIntent = {}
): ProviderOptions | undefined {
  if (config.provider === 'qwen-local') {
    return intent.disableReasoning
      ? {
          'qwen-local': {
            reasoningEffort: 'none',
          },
        } satisfies ProviderOptions
      : undefined;
  }

  if (config.provider === 'ollama' && config.contextSize) {
    return {
      ollama: {
        options: {
          num_ctx: config.contextSize,
        },
      },
    } satisfies ProviderOptions;
  }

  return undefined;
}
