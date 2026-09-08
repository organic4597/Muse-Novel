import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import { createOllama } from 'ollama-ai-provider-v2';

import type { ProviderConfig } from './types';
import { createChatGPTProvider } from './chatgpt-provider';

function withV1Path(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`;
}

export function transformQwenRequestBody(body: Record<string, unknown>) {
  const existingTemplateArguments =
    typeof body.chat_template_kwargs === 'object' &&
    body.chat_template_kwargs !== null &&
    !Array.isArray(body.chat_template_kwargs)
      ? body.chat_template_kwargs as Record<string, unknown>
      : {};

  return {
    ...body,
    min_p: 0,
    top_k: 20,
    ...(body.reasoning_effort === 'none'
      ? {
          chat_template_kwargs: {
            ...existingTemplateArguments,
            enable_thinking: false,
          },
        }
      : {}),
  };
}

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
    case 'chatgpt': return createChatGPTProvider(config.modelId);
    case 'openai-compatible': {
      if (!config.baseUrl?.trim() || !config.modelId.trim()) {
        throw new Error('OpenAI 호환 API의 Base URL과 모델 ID를 입력해주세요.');
      }
      const compatible = createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: withV1Path(config.baseUrl.trim()),
        apiKey: config.apiKey || undefined,
      });
      return compatible.chatModel(config.modelId);
    }
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
        baseURL: withV1Path(config.baseUrl || 'http://127.0.0.1:5001'),
        // KoboldCpp does not require an API key
        apiKey: config.apiKey || 'no-key',
      });
      return koboldcpp.chatModel(config.modelId || 'koboldcpp');
    }
    case 'qwen-local': {
      const qwenLocal = createOpenAICompatible({
        name: 'qwen-local',
        baseURL: withV1Path(config.baseUrl || 'http://127.0.0.1:8321'),
        apiKey: config.apiKey || 'no-key',
        supportsStructuredOutputs: true,
        transformRequestBody: transformQwenRequestBody,
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
