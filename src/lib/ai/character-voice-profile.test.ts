import { describe, expect, it } from 'vitest';

import {
  collectCharacterVoiceExcerpts,
  validateCharacterVoiceProfile,
} from './character-voice-profile';

const plate = (text: string) =>
  JSON.stringify([{ type: 'p', children: [{ text }] }]);

describe('character voice evidence', () => {
  it('collects only chapters in which the named character appears', () => {
    const corpus = collectCharacterVoiceExcerpts([
      { title: '제 1장', contentJson: plate('곽진봉이 말했다. “그 말은 믿기 어렵군.”') },
      { title: '제 2장', contentJson: plate('다른 인물만 등장한다.') },
    ], '곽진봉');
    expect(corpus).toContain('그 말은 믿기 어렵군.');
    expect(corpus).not.toContain('다른 인물만');
  });

  it('keeps only verbatim manuscript examples and rejects unsupported profiles', () => {
    const corpus = '곽진봉이 말했다. “그 말은 믿기 어렵군.”';
    expect(validateCharacterVoiceProfile(corpus, {
      guide: '짧은 평서문으로 의심을 드러낸다.',
      examples: [
        { quote: '그 말은 믿기 어렵군.', note: '직접 반박하지 않고 의심한다.' },
        { quote: '원고에 없는 대사', note: '환각' },
      ],
    })?.examples).toHaveLength(1);
    expect(validateCharacterVoiceProfile(corpus, {
      guide: '근거 없는 규칙', examples: [{ quote: '없는 말', note: '' }],
    })).toBeNull();
  });
});
