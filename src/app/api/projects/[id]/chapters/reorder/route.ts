import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
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

  if (new Set(orderedIds).size !== orderedIds.length) {
    return NextResponse.json(
      { error: 'orderedIds에 중복된 챕터가 있습니다.' },
      { status: 400 }
    );
  }

  const existingChapters = await listChapters(db, projectId);
  const existingIds = new Set(existingChapters.map((chapter) => chapter.id));
  if (
    orderedIds.length !== existingIds.size ||
    !orderedIds.every((id) => existingIds.has(id as string))
  ) {
    return NextResponse.json(
      { error: '프로젝트의 전체 챕터만 순서 변경할 수 있습니다.' },
      { status: 400 }
    );
  }

  try {
    db.transaction((tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        tx.update(chapters)
          .set({ order: i, updatedAt: new Date() })
          .where(
            and(
              eq(chapters.id, orderedIds[i] as string),
              eq(chapters.projectId, projectId)
            )
          )
          .run();
      }
    });

    return NextResponse.json({ success: true, projectId });
  } catch {
    return NextResponse.json(
      { error: '순서 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
