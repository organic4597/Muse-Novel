import { describe, expect, it } from 'vitest';

import {
  expandWritingKnowledgeQueries,
  isWritingKnowledgeIndexPayload,
  prepareWritingKnowledgeIndex,
  searchPreparedWritingKnowledge,
  type WritingKnowledgeIndexPayload,
} from './writing-knowledge-client';

const payload: WritingKnowledgeIndexPayload = {
  categories: ['대사', '액션'],
  documents: [
    {
      category: '대사',
      content: '인물은 직접 말하지 않고 서브텍스트로 욕망을 드러낸다.',
      genres: ['무협'],
      id: 'dialogue-subtext',
      kind: 'craft',
      summary: '대사의 목적과 서브텍스트를 다룬다.',
      tags: ['대사', '서브텍스트'],
      title: '대사에 숨은 의도 넣기',
    },
    {
      category: '액션',
      content: '전투 이후에는 부상과 체력 소모가 다음 장면에 이어져야 한다.',
      genres: ['무협'],
      id: 'combat-consequence',
      kind: 'domain',
      summary: '전투 부상과 후유증의 연속성을 다룬다.',
      tags: ['전투', '부상'],
      title: '전투의 결과',
    },
  ],
  total: 2,
  version: 'test-version',
};

describe('browser writing knowledge search', () => {
  it('validates a complete versioned index', () => {
    expect(isWritingKnowledgeIndexPayload(payload)).toBe(true);
    expect(
      isWritingKnowledgeIndexPayload({ ...payload, total: payload.total + 1 })
    ).toBe(false);
  });

  it('expands a scene request without an LLM round trip', () => {
    expect(expandWritingKnowledgeQueries('대사의 긴장감을 높여줘')).toEqual(
      expect.arrayContaining([
        '대사의 긴장감을 높여줘',
        expect.stringContaining('서브텍스트'),
      ])
    );
  });

  it('returns only bounded match metadata while keeping content in the worker', () => {
    const result = searchPreparedWritingKnowledge(
      prepareWritingKnowledgeIndex(payload),
      '부상 후유증이 남는 전투',
      { genre: '무협', limit: 1 }
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.id).toBe('combat-consequence');
    expect(result.matches[0]).not.toHaveProperty('content');
    expect(result.version).toBe('test-version');
  });

  it('applies category and kind filters in the browser index', () => {
    const result = searchPreparedWritingKnowledge(
      prepareWritingKnowledgeIndex(payload),
      '전투 대사',
      { category: '대사', kind: 'craft' }
    );

    expect(result.matches.map((match) => match.id)).toEqual(['dialogue-subtext']);
  });
});
