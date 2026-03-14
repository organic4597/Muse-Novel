import { NextResponse } from 'next/server';

import { generateCharacterSuggestion } from '@/lib/ai/entity-suggestions';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (!body.description || typeof body.description !== 'string' || !body.description.trim()) {
    return NextResponse.json(
      { error: '설명은 필수입니다.' },
      { status: 400 }
    );
  }

  try {
    const suggestion = await generateCharacterSuggestion({
      projectId: id,
      description: body.description.trim(),
    });

    return NextResponse.json(suggestion);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '캐릭터 제안을 생성하지 못했습니다.',
      },
      { status: 500 }
    );
  }
}