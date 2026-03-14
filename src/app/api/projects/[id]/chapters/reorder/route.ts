import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { chapters } from '@/lib/db/schema';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  let body: { orderedIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '잘못된 요청 형식입니다.' },
      { status: 400 }
    );
  }

  const { orderedIds } = body;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json(
      { error: 'orderedIds 배열이 필요합니다.' },
      { status: 400 }
    );
  }

  if (!orderedIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json(
      { error: 'orderedIds는 문자열 배열이어야 합니다.' },
      { status: 400 }
    );
  }

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      db.update(chapters)
        .set({ order: i, updatedAt: new Date() })
        .where(eq(chapters.id, orderedIds[i] as string))
        .run();
    }

    return NextResponse.json({ success: true, projectId });
  } catch {
    return NextResponse.json(
      { error: '순서 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
