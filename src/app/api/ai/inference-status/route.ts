import { NextResponse } from 'next/server';

import {
  getServerModelId,
  isServerRunning,
  getLoraStatus,
} from '@/lib/ai/qwen-server-manager';

export async function GET() {
  const running = await isServerRunning();
  const modelId = running ? await getServerModelId() : null;
  const lora = running ? await getLoraStatus() : null;

  return NextResponse.json({
    running,
    modelId,
    lora: lora ?? { loaded: false, adapter_path: null },
  });
}
