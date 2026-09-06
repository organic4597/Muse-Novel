import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import {
  getExternalService,
  setExternalService,
} from '@/lib/db/queries/external-services';
import { getProject } from '@/lib/db/queries/projects';
import { normalizeExternalServiceUrl } from '@/lib/external-services/client';

const serviceTypeSchema = z.enum([
  'tag-recommender',
  'lora-training',
  'embedding',
  'web-search',
]);
const saveSchema = z.object({
  serviceType: serviceTypeSchema,
  projectId: z.string().uuid().nullable().optional(),
  baseUrl: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsedType = serviceTypeSchema.safeParse(
    searchParams.get('serviceType')
  );
  if (!parsedType.success) {
    return NextResponse.json(
      { error: '올바른 serviceType이 필요합니다.' },
      { status: 400 }
    );
  }

  const projectId = searchParams.get('projectId');
  const setting = await getExternalService(
    db,
    parsedType.data,
    projectId
  );
  return NextResponse.json(setting ?? null);
}

export async function PUT(request: Request) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: '외부 서비스 설정 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  if (parsed.data.projectId) {
    const project = await getProject(db, parsed.data.projectId);
    if (!project) {
      return NextResponse.json(
        { error: '프로젝트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
  }

  let baseUrl: string;
  try {
    baseUrl = normalizeExternalServiceUrl(parsed.data.baseUrl);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'URL이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const setting = await setExternalService(db, {
    serviceType: parsed.data.serviceType,
    projectId: parsed.data.projectId,
    baseUrl,
  });
  return NextResponse.json(setting);
}
