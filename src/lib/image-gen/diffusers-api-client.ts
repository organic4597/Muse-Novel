import { normalizeExternalServiceUrl } from '@/lib/external-services/client';
import type {
  GeneratedImage,
  ImageGenerationRequest,
  ImageGenerationResult,
} from './types';

export class DiffusersApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeExternalServiceUrl(baseUrl);
  }

  async generate(
    request: ImageGenerationRequest
  ): Promise<ImageGenerationResult> {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(10 * 60_000),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(
        `Diffusers API 응답 오류: HTTP ${response.status}${message ? ` - ${message.slice(0, 200)}` : ''}`
      );
    }

    const data = (await response.json()) as {
      images?: GeneratedImage[];
      prompt?: string;
      negativePrompt?: string;
    };
    if (!Array.isArray(data.images) || data.images.length === 0) {
      throw new Error('Diffusers API가 이미지를 반환하지 않았습니다.');
    }

    return {
      images: data.images,
      prompt: data.prompt ?? request.prompt,
      negativePrompt: data.negativePrompt ?? request.negativePrompt ?? '',
    };
  }

  async checkConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok
        ? { ok: true, message: 'Diffusers API 연결 성공' }
        : { ok: false, message: `HTTP ${response.status}` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
