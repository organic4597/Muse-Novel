import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { getProject } from '@/lib/db/queries/projects';
import { reviewWorldSuggestions, WorldSuggestionReviewError } from '@/lib/db/queries/world-suggestions';

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  suggestionIds: z.array(z.string().uuid()).min(1).max(20),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '승인 또는 거부할 후보를 선택해주세요.' }, { status: 400 });
  if (!(await getProject(db, id))) return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  try {
    const result = await reviewWorldSuggestions(db, id, [...new Set(parsed.data.suggestionIds)], parsed.data.action);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorldSuggestionReviewError ? error.message : '검토 결과를 저장하지 못했습니다. 다시 시도해주세요.' },
      { status: error instanceof WorldSuggestionReviewError ? 409 : 500 });
  }
}
