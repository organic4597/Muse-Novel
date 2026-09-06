import { describe, expect, it } from 'vitest';

import { getProviderOptions } from './provider-options';

describe('getProviderOptions', () => {
  it('disables Qwen reasoning only when the caller requests a fast response', () => {
    expect(
      getProviderOptions({
        provider: 'qwen-local',
        modelId: 'SuperQwen3.8-27B-abliterated',
      }, { disableReasoning: true })
    ).toEqual({
      'qwen-local': {
        reasoningEffort: 'none',
      },
    });

    expect(
      getProviderOptions({
        provider: 'qwen-local',
        modelId: 'SuperQwen3.8-27B-abliterated',
      })
    ).toBeUndefined();
  });

  it('keeps Ollama context configuration provider-specific', () => {
    expect(
      getProviderOptions({
        provider: 'ollama',
        modelId: 'qwen3:8b',
        contextSize: 32_768,
      })
    ).toEqual({ ollama: { options: { num_ctx: 32_768 } } });
  });
});
