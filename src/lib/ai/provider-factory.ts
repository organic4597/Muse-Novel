import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

import type { ProviderConfig } from './types';

/**
 * Create an AI SDK LanguageModel from a ProviderConfig.
 *
 * Supported providers:
 * - openai: GPT models via OpenAI API
 * - anthropic: Claude models via Anthropic API
 * - ollama: Local models via Ollama (chat or completion mode)
 * - nvidia: NVIDIA NIM models via OpenAI-compatible endpoint
 */
export function createProvider(config: ProviderConfig): LanguageModel {
  switch (config.provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      });
      return openai(config.modelId);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(config.modelId);
    }
    case 'ollama': {
      const provider = createOllama({
        baseURL: config.baseUrl || 'http://localhost:11434',
        compatibility: 'strict',
      });
      if (config.mode === 'chat') {
        return provider.chat(config.modelId);
      }
      // Default to completion mode for Ollama
      return provider.completion(config.modelId);
    }
    case 'nvidia': {
      const nvidia = createOpenAICompatible({
        name: 'nvidia',
        baseURL:
          config.baseUrl || 'https://integrate.api.nvidia.com/v1',
        apiKey: config.apiKey || process.env.NVIDIA_API_KEY,
      });
      return nvidia.chatModel(config.modelId);
    }
    case 'koboldcpp': {
      const koboldcpp = createOpenAICompatible({
        name: 'koboldcpp',
        baseURL: (config.baseUrl || 'http://localhost:5001') + '/v1',
        // KoboldCpp does not require an API key
        apiKey: config.apiKey || 'no-key',
      });
      return koboldcpp.chatModel(config.modelId || 'koboldcpp');
    }
    case 'qwen-local': {
      const qwenLocal = createOpenAICompatible({
        name: 'qwen-local',
        baseURL: (config.baseUrl || 'http://localhost:8321') + '/v1',
        apiKey: config.apiKey || 'no-key',
      });
      return qwenLocal.chatModel(config.modelId || 'Qwen/Qwen3.5-9B-Base');
    }
    default: {
      throw new Error(
        `Unsupported AI provider: ${(config as ProviderConfig).provider}`
      );
    }
  }
}
