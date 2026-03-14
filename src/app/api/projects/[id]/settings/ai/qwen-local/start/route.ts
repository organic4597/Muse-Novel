import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { listProviders } from '@/lib/db/queries/ai-settings';
import { getProject } from '@/lib/db/queries/projects';
import { getLora } from '@/lib/db/queries/loras';
import { ensureServerForInference } from '@/lib/ai/qwen-server-manager';

type RequestBody = {
  modelName?: string;
  baseUrl?: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = (await request.json().catch(() => ({}))) as RequestBody;

  const providers = await listProviders(db, projectId);
  const qwenLocal = providers.find((provider) => provider.providerType === 'qwen-local');

  if (!qwenLocal && !body.modelName) {
    return NextResponse.json(
      { ok: false, message: 'Qwen Local 설정이 없습니다. 먼저 모델 이름을 저장하세요.' },
      { status: 404 }
    );
  }

  const project = await getProject(db, projectId);
  const activeLora = project?.activeLoraId
    ? await getLora(db, project.activeLoraId)
    : undefined;

  const loraPath = activeLora
    ? activeLora.filePath.replace(/\/[^/]+$/, '')
    : undefined;

  const result = await ensureServerForInference({
    baseUrl: body.baseUrl ?? qwenLocal?.baseUrl ?? undefined,
    loraPath,
    modelId: body.modelName ?? qwenLocal?.modelName ?? undefined,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}