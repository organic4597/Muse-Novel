/**
 * GPU Configuration — single source of truth for GPU allocation across tasks.
 *
 * Hardware:
 *   GPU 0 = RTX 3060 12GB
 *   GPU 1 = RTX 4070 SUPER 12GB
 *
 * Allocation strategy:
 *
 * ┌──────────────┬──────────────┬──────────────────────────────────────────┐
 * │ 작업          │ GPU          │ 비고                                      │
 * ├──────────────┼──────────────┼──────────────────────────────────────────┤
 * │ 추론 (llama) │ GPU 1        │ 4070S 단독. 평상시 상주.                    │
 * │ LoRA 학습     │ GPU 0 + 1   │ 양쪽 전부 사용. 학습 전 추론 서버 종료.       │
 * │ 이미지 생성   │ GPU 0 + 1   │ 양쪽 전부 사용. 생성 전 추론 서버 종료.       │
 * └──────────────┴──────────────┴──────────────────────────────────────────┘
 *
 * 동시 실행 불가:
 *   - LoRA 학습 중 → 이미지 생성 거부
 *   - 이미지 생성 중 → 추론 서버 꺼짐 (생성 후 자동 재시작)
 *   - LoRA 학습 중 → 추론 서버 꺼짐 (학습 후 자동 재시작)
 */

/**
 * GPUs to use for inference (llama-server).
 * Typically a single GPU to leave the other free for background tasks.
 */
export function getInferenceGpu(): string {
  return process.env.QWEN_INFERENCE_GPU?.trim() || '1';
}

/**
 * GPUs to use for LoRA training.
 * Returns comma-separated string for CUDA_VISIBLE_DEVICES.
 */
export function getTrainingGpus(): string {
  return process.env.QLORA_TRAIN_CUDA_DEVICES?.trim() || '0,1';
}

/**
 * GPUs to use for image generation (diffusers).
 * Returns array of GPU indices for parallel batch splitting.
 *
 * Since inference server is stopped before image gen,
 * both GPUs are available by default.
 */
export function getImageGenGpus(): string[] {
  const env = process.env.IMAGE_GEN_GPUS?.trim();
  if (env) {
    return env.split(',').map((s) => s.trim()).filter(Boolean);
  }
  // Default: use all GPUs (inference server is stopped during image gen)
  return ['0', '1'];
}

/**
 * Get all physical GPU indices available in the system.
 */
export function getAllGpus(): string[] {
  const env = process.env.ALL_GPU_INDICES?.trim();
  if (env) {
    return env.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return ['0', '1'];
}

/**
 * VRAM to reserve for display output (MB).
 * Passed to Python scripts so torch limits per-process memory usage,
 * leaving headroom for the GPU driving the monitor.
 * Set DISPLAY_VRAM_RESERVE_MB=0 to disable.
 */
export function getDisplayVramReserveMb(): number {
  const val = parseInt(process.env.DISPLAY_VRAM_RESERVE_MB?.trim() ?? '', 10);
  return Number.isNaN(val) ? 512 : val;
}
