import { describe, expect, it } from 'vitest';

import { getContextForCopilot, getNovelSystemPrompt } from '@/lib/ai/prompts';
import {
  getNextCandidateIndex,
  InlineSuggestionKit,
} from '../plugins/inline-suggestion-plugin';

// ─── InlineSuggestionPlugin Configuration Tests ──────────────────────────────

describe('InlineSuggestionPlugin configuration', () => {
  const entry = InlineSuggestionKit.find(
    (e: any) => e.key === 'inlineSuggestion'
  ) as any;

  it('should be present in InlineSuggestionKit', () => {
    expect(entry).toBeDefined();
  });

  it('should expose clearSuggestion shortcut configuration', () => {
    const shortcuts = entry?.__configuration?.({})?.shortcuts ?? entry?.shortcuts;
    expect(shortcuts?.clearSuggestion).toBeDefined();
  });

  it('cycles explicit candidates in both directions', () => {
    expect(getNextCandidateIndex(0, 3, 1)).toBe(1);
    expect(getNextCandidateIndex(2, 3, 1)).toBe(0);
    expect(getNextCandidateIndex(0, 3, -1)).toBe(2);
  });
});

// ─── getNovelSystemPrompt Tests ─────────────────────────────────────────────

describe('getNovelSystemPrompt', () => {
  it('returns a Korean system prompt containing project title/genre and character names and world entry titles', () => {
    const project = {
      id: '1',
      title: '용의 후예',
      genre: '판타지',
      synopsis: '고대 용의 피를 이어받은 소녀의 모험',
      settingsJson: null,
      writingStyleSample: null,
      writingStyleDescription: null,
      activeWritingStyleProfileId: null,
      activeLoraId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      loraPath: null,
      loraGeneratedAt: null,
    };

    const characters = [
      {
        id: 'c1',
        projectId: '1',
        name: '이서연',
        role: '주인공',
        appearance: null,
        personality: '냉정하지만 약자에게 다정하다',
        backstory: null,
        arcDescription: null,
        itemsJson: null,
        imagePath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c2',
        projectId: '1',
        name: '박지훈',
        role: '동료',
        appearance: null,
        personality: null,
        backstory: null,
        arcDescription: null,
        itemsJson: null,
        imagePath: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const worldEntries = [
      {
        id: 'w1',
        projectId: '1',
        category: '장소',
        title: '용의 계곡',
        content: '고대 용이 잠들어 있는 신비로운 계곡',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const prompt = getNovelSystemPrompt(project, characters, worldEntries);

    // Must be Korean
    expect(prompt).toContain('한국어');
    // Must include project context
    expect(prompt).toContain('용의 후예');
    expect(prompt).toContain('판타지');
    // Must include character names
    expect(prompt).toContain('이서연');
    expect(prompt).toContain('박지훈');
    // Must include world entry titles
    expect(prompt).toContain('용의 계곡');
    expect(prompt).toContain('냉정하지만 약자에게 다정하다');
    expect(prompt).toContain('고대 용이 잠들어 있는 신비로운 계곡');
    expect(prompt).toContain('결과물만 출력');
    expect(prompt.indexOf('품질 기준')).toBeLessThan(prompt.indexOf('<story_bible>'));
  });

  it('returns base Korean prompt with empty arrays', () => {
    const project = {
      id: '2',
      title: '빈 프로젝트',
      genre: null,
      synopsis: null,
      settingsJson: null,
      writingStyleSample: null,
      writingStyleDescription: null,
      activeWritingStyleProfileId: null,
      activeLoraId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      loraPath: null,
      loraGeneratedAt: null,
    };

    const prompt = getNovelSystemPrompt(project, [], []);

    // Must still be Korean base prompt
    expect(prompt).toContain('한국어');
    expect(prompt).toContain('소설');
    expect(prompt).toContain('빈 프로젝트');
    // No character or world section markers when empty
    expect(prompt).not.toContain('등장인물');
    expect(prompt).not.toContain('세계관');
  });
});

// ─── getContextForCopilot Tests ─────────────────────────────────────────────

describe('getContextForCopilot', () => {
  it('returns last 1500 chars from long content', () => {
    const content = 'A'.repeat(3000);
    const result = getContextForCopilot(content);

    expect(result).toHaveLength(1500);
    expect(result).toBe('A'.repeat(1500));
  });

  it('returns full content when shorter than maxChars', () => {
    const content = '짧은 텍스트입니다.';
    const result = getContextForCopilot(content);

    expect(result).toBe(content);
    expect(result.length).toBeLessThanOrEqual(1500);
  });

  it('returns empty string for empty input', () => {
    const result = getContextForCopilot('');
    expect(result).toBe('');
  });

  it('respects custom maxChars parameter', () => {
    const content = 'B'.repeat(500);
    const result = getContextForCopilot(content, 200);

    expect(result).toHaveLength(200);
    expect(result).toBe('B'.repeat(200));
  });
});
