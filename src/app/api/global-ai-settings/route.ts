import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  getGlobalDefaultProvider,
  listGlobalProviders,
  setGlobalProvider,
  deleteProvider,
  updateProvider,
} from '@/lib/db/queries/ai-settings';

export async function GET() {
  try {
    const providers = await listGlobalProviders(db);
    const defaultProvider = await getGlobalDefaultProvider(db);
    return NextResponse.json({ providers, defaultId: defaultProvider?.id ?? null });
  } catch (error) {
    console.error('[global-ai-settings] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { providerType, modelName, apiKeyEncrypted, baseUrl, contextSize, isDefault } = body;

    if (!providerType || !modelName) {
      return NextResponse.json({ error: 'providerType과 modelName은 필수입니다.' }, { status: 400 });
    }

    const provider = await setGlobalProvider(db, {
      providerType,
      modelName,
      apiKeyEncrypted,
      baseUrl,
      contextSize,
      isDefault: isDefault ?? true,
    });

    return NextResponse.json(provider);
  } catch (error) {
    console.error('[global-ai-settings] POST error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    const updated = await updateProvider(db, id, data);
    return NextResponse.json(updated);
  } catch (error) {
    console.error('[global-ai-settings] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

    await deleteProvider(db, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[global-ai-settings] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete settings' }, { status: 500 });
  }
}
