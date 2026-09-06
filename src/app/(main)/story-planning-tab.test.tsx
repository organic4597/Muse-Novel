import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  compactStoryPlanningRequestMessages,
  createStoryPlanningPreviewScheduler,
  readStoryPlanningEventStream,
  StoryPlanningMessageContent,
} from './story-planning-tab';

describe('StoryPlanningMessageContent', () => {
  it('sends only recent role/content history without draft snapshots', () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `message-${index}`,
      draftSnapshot: {
        characters: [],
        currentPhase: 'characters' as const,
        synopsis: `snapshot-${index}`,
        worldEntries: [],
      },
      options: ['다음'],
    }));

    const compacted = compactStoryPlanningRequestMessages(messages);

    expect(compacted).toHaveLength(24);
    expect(compacted[0]).toEqual({ role: 'user', content: 'message-6' });
    expect(compacted.at(-1)).toEqual({
      role: 'assistant',
      content: 'message-29',
    });
    expect(JSON.stringify(compacted)).not.toContain('snapshot-');
    expect(JSON.stringify(compacted)).not.toContain('options');
  });

  it('renders GFM tables as a visible, scrollable table', () => {
    render(
      <StoryPlanningMessageContent
        message={{
          role: 'assistant',
          content: [
            '검은 토끼의 관계를 정리하면:',
            '',
            '| 관계 | 인물·세력 | 성격·역할 |',
            '| --- | --- | --- |',
            "| 소문 | 상인 | 토끼를 '약재'로 전파 |",
            '| 핵심 인연 | 어린 승려 | 소림 편입의 매개 |',
          ].join('\n'),
        }}
      />
    );

    const table = screen.getByRole('table');
    expect(table).toHaveClass('border-collapse');
    expect(table.parentElement).toHaveClass('overflow-x-auto');
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByText('어린 승려')).toBeInTheDocument();
  });

  it('combines streamed reply deltas and returns the final planning payload', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode([
          'event: status',
          'data: {"message":"답변을 구성하는 중..."}',
          '',
          'event: delta',
          'data: {"text":"중반"}',
          '',
        ].join('\n')));
        controller.enqueue(encoder.encode([
          '',
          'event: delta',
          'data: {"text":" 플롯"}',
          '',
          'event: done',
          'data: {"reply":"중반 플롯","draft":{"characters":[],"worldEntries":[]}}',
          '',
          '',
        ].join('\n')));
        controller.close();
      },
    });
    const previews: string[] = [];
    const statuses: string[] = [];

    const result = await readStoryPlanningEventStream(
      new Response(stream),
      (preview) => previews.push(preview),
      (status) => statuses.push(status)
    );

    expect(previews).toEqual(['중반 플롯']);
    expect(statuses).toEqual(['답변을 구성하는 중...']);
    expect(result.reply).toBe('중반 플롯');
    expect(result.draft?.characters).toEqual([]);
  });

  it('batches rapid preview updates and flushes the latest text on demand', () => {
    vi.useFakeTimers();
    try {
      const previews: string[] = [];
      const scheduler = createStoryPlanningPreviewScheduler(
        (preview) => previews.push(preview),
        50
      );

      scheduler.push('중');
      scheduler.push('중반');
      scheduler.push('중반 플롯');

      vi.advanceTimersByTime(49);
      expect(previews).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(previews).toEqual(['중반 플롯']);

      scheduler.push('중반 플롯 완성');
      scheduler.flush();
      expect(previews).toEqual(['중반 플롯', '중반 플롯 완성']);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes received text before surfacing a later stream error', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              'event: delta',
              'data: {"text":"유효한 초안"}',
              '',
              'event: error',
              'data: {"message":"모델 연결이 끊겼습니다."}',
              '',
              '',
            ].join('\n')
          )
        );
        controller.close();
      },
    });
    const previews: string[] = [];

    await expect(
      readStoryPlanningEventStream(new Response(stream), (preview) =>
        previews.push(preview)
      )
    ).rejects.toThrow('모델 연결이 끊겼습니다.');
    expect(previews).toEqual(['유효한 초안']);
  });
});
