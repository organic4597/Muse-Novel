import type { GeneratedImage, ImageGenerationRequest, ImageGenerationResult } from './types';

/**
 * Automatic1111 / Stable Diffusion WebUI API client.
 * Communicates with the /sdapi/v1 endpoints.
 */
export class Automatic1111Client {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Normalize: remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async txt2img(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const payload = {
      prompt: request.prompt,
      negative_prompt: request.negativePrompt ?? '',
      width: request.width,
      height: request.height,
      steps: request.steps,
      sampler_name: request.sampler,
      cfg_scale: request.cfgScale,
      batch_size: request.batchSize,
      seed: request.seed ?? -1,
      override_settings: request.modelName
        ? { sd_model_checkpoint: request.modelName }
        : undefined,
    };

    const url = `${this.baseUrl}/sdapi/v1/txt2img`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000), // 2 min timeout for generation
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Automatic1111 API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as {
      images: string[];
      parameters: Record<string, unknown>;
      info: string;
    };

    // Parse info JSON for seeds
    let infoObj: { all_seeds?: number[]; seed?: number } = {};
    try {
      infoObj = JSON.parse(data.info);
    } catch {
      // info may not be valid JSON
    }

    const seeds = infoObj.all_seeds ?? [];
    const images: GeneratedImage[] = data.images.map((b64, i) => ({
      base64: b64,
      seed: seeds[i] ?? infoObj.seed ?? -1,
      width: request.width,
      height: request.height,
    }));

    return {
      images,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt ?? '',
    };
  }

  /** Quick health check */
  async checkConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const url = `${this.baseUrl}/sdapi/v1/sd-models`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        return { ok: false, message: `HTTP ${res.status}` };
      }
      return { ok: true, message: '연결됨' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: msg };
    }
  }
}
