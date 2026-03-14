import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  listImageProviders,
  setImageProvider,
  updateImageProvider,
  deleteImageProvider,
} from '@/lib/db/queries/image-provider-settings';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const providers = await listImageProviders(db, projectId);
  return NextResponse.json(providers);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const { providerType, baseUrl, modelName, isDefault, defaultWidth, defaultHeight, defaultSteps, defaultSampler, defaultCfgScale, defaultNegativePrompt } = body;

  if (!providerType) {
    return NextResponse.json(
      { error: 'providerType은 필수입니다.' },
      { status: 400 }
    );
  }

  if (!baseUrl) {
    return NextResponse.json(
      { error: 'baseUrl은 필수입니다.' },
      { status: 400 }
    );
  }

  const created = await setImageProvider(db, projectId, {
    providerType,
    baseUrl,
    modelName,
    isDefault: isDefault ?? true,
    defaultWidth,
    defaultHeight,
    defaultSteps,
    defaultSampler,
    defaultCfgScale,
    defaultNegativePrompt,
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await request.json();

  const { id, ...data } = body;
  if (!id) {
    return NextResponse.json(
      { error: 'id는 필수입니다.' },
      { status: 400 }
    );
  }

  const updated = await updateImageProvider(db, id, data);
  if (!updated) {
    return NextResponse.json(
      { error: '설정을 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const settingId = searchParams.get('id');

  if (!settingId) {
    return NextResponse.json(
      { error: 'id 파라미터가 필요합니다.' },
      { status: 400 }
    );
  }

  await deleteImageProvider(db, settingId);
  return NextResponse.json({ ok: true });
}
