import { describe, expect, it } from 'vitest';

import {
  buildConsistencyPrompt,
  buildConsistencySourceBatches,
  parseConsistencyReport,
  validateConsistencyReport,
} from './story-consistency';

describe('story consistency report', () => {
  it('parses only the bounded structured report', () => {
    const report = parseConsistencyReport(`\n\`\`\`json\n${JSON.stringify({
      findings: [
        {
          category: 'item',
          confidence: 0.92,
          description: '분실한 검을 다음 장에서 다시 사용한다.',
          evidence: [
            { quote: '검을 잃었다.', sourceId: 'c1', sourceTitle: '1장' },
            { quote: '검을 뽑았다.', sourceId: 'c2', sourceTitle: '2장' },
          ],
          severity: 'error',
          suggestion: '2장의 무기를 바꾸거나 회수 장면을 추가한다.',
          title: '분실한 검 재등장',
        },
      ],
      summary: '소지품 연속성 오류 1건',
    })}\n\`\`\``);
    expect(report.findings[0]).toMatchObject({ category: 'item', severity: 'error' });
  });

  it('rejects unsupported categories and includes anti-false-positive rules', () => {
    expect(() =>
      parseConsistencyReport(
        JSON.stringify({
          findings: [{ category: 'guess' }],
          summary: '잘못된 결과',
        })
      )
    ).toThrow();
    expect(buildConsistencyPrompt('자료')).toContain('의도적 미스터리');
    expect(buildConsistencyPrompt('자료')).toContain('소지품');
  });

  it('keeps canon and every chapter represented within the context budget', () => {
    const sources = [
      { content: '규칙'.repeat(1000), id: 'world-1', title: '규칙', type: 'world' as const },
      ...Array.from({ length: 5 }, (_, index) => ({
        content: `챕터${index} `.repeat(1000),
        id: `chapter-${index}`,
        title: `${index + 1}장`,
        type: 'chapter' as const,
      })),
    ];
    const batches = buildConsistencySourceBatches(sources, 5000, 2);
    expect(batches.every((batch) => batch.length <= 5000)).toBe(true);
    const text = batches.join('\n');
    expect(text.match(/sourceId=world-1/g)).toHaveLength(1);
    for (let index = 0; index < 5; index += 1) {
      expect(text.match(new RegExp(`sourceId=chapter-${index}`, 'g'))).toHaveLength(1);
    }
  });

  it('drops invented evidence and downgrades a one-source error', () => {
    const sources = [
      {
        content: '토끼는 검을 잃었다.',
        id: 'chapter-1',
        title: '1장',
        type: 'chapter' as const,
      },
    ];
    const report = validateConsistencyReport(
      {
        findings: [
          {
            category: 'item',
            confidence: 0.99,
            description: '검 상태 확인',
            evidence: [
              {
                quote: '토끼는 검을 잃었다.',
                sourceId: 'chapter-1',
                sourceTitle: '1장',
              },
            ],
            severity: 'error',
            suggestion: '회수 장면 확인',
            title: '검 상태',
          },
          {
            category: 'timeline',
            confidence: 0.9,
            description: '허위 근거',
            evidence: [
              {
                quote: '원문에 없는 문장',
                sourceId: 'chapter-1',
                sourceTitle: '1장',
              },
            ],
            severity: 'warning',
            suggestion: '없음',
            title: '허위',
          },
        ],
        summary: '모델 요약',
      },
      sources
    );
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      confidence: 0.68,
      severity: 'warning',
      title: '검 상태',
    });
  });
});
