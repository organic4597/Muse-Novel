import { describe, expect, it } from 'vitest';
import { formatStorylineNoteSummary } from './storyline-assistant';

describe('storyline note summary', () => {
  it('formats only non-empty decision sections as a reusable note', () => {
    expect(formatStorylineNoteSummary({
      title: '북악 향산 2막 방향',
      confirmed: ['주인공은 소림의 명예장로가 된다.'],
      proposals: ['어린 승려가 소림 편입을 중재하게 한다.'],
      openQuestions: [],
    })).toBe([
      '## 북악 향산 2막 방향',
      '### 확정된 내용',
      '- 주인공은 소림의 명예장로가 된다.',
      '### 검토할 제안',
      '- 어린 승려가 소림 편입을 중재하게 한다.',
    ].join('\n\n'));
  });
});
