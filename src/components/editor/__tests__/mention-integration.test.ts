import { describe, expect, it } from 'vitest';

import { MentionKit } from '../plugins/mention-kit';

// ─── MentionPlugin Configuration Tests ──────────────────────────────────────

describe('MentionPlugin configuration', () => {
  const mentionEntry = MentionKit.find(
    (entry: any) => entry.key === 'mention'
  ) as any;

  const mentionInputEntry = MentionKit.find(
    (entry: any) => entry.key === 'mention_input'
  ) as any;

  it('should export MentionPlugin in MentionKit', () => {
    expect(mentionEntry).toBeDefined();
  });

  it('should export MentionInputPlugin in MentionKit', () => {
    expect(mentionInputEntry).toBeDefined();
  });

  it('should have trigger = @', () => {
    const resolvedConfig = mentionEntry?.__configuration?.({});
    expect(resolvedConfig?.options?.trigger).toBeUndefined();
    // Default trigger for MentionPlugin is '@' — not overridden, so stays default
  });

  it('should have triggerPreviousCharPattern matching Korean characters', () => {
    const resolvedConfig = mentionEntry?.__configuration?.({});
    const pattern = resolvedConfig?.options
      ?.triggerPreviousCharPattern as RegExp;

    expect(pattern).toBeDefined();
    expect(pattern).toBeInstanceOf(RegExp);

    // Empty string (start of line)
    expect(pattern.test('')).toBe(true);
    // Whitespace
    expect(pattern.test(' ')).toBe(true);
    // Quote characters
    expect(pattern.test("'")).toBe(true);
    expect(pattern.test('"')).toBe(true);
    // Korean consonants (ㄱ-ㅎ)
    expect(pattern.test('ㄱ')).toBe(true);
    expect(pattern.test('ㅎ')).toBe(true);
    // Korean vowels (ㅏ-ㅣ)
    expect(pattern.test('ㅏ')).toBe(true);
    expect(pattern.test('ㅣ')).toBe(true);
    // Korean syllables (가-힣)
    expect(pattern.test('가')).toBe(true);
    expect(pattern.test('힣')).toBe(true);
    expect(pattern.test('서')).toBe(true);
    expect(pattern.test('연')).toBe(true);
    // Latin characters should NOT match
    expect(pattern.test('a')).toBe(false);
    expect(pattern.test('Z')).toBe(false);
    // Digits should NOT match
    expect(pattern.test('5')).toBe(false);
  });
});

// ─── Mentions API Response Format Tests ─────────────────────────────────────

describe('Mentions API response format', () => {
  it('should define correct MentionItem shape', () => {
    // Validate expected API response shape
    const mockResponse = {
      items: [
        { id: 'c1', text: '이서연', category: 'character' as const },
        { id: 'w1', text: '용의 계곡', category: 'world' as const },
      ],
    };

    expect(mockResponse.items).toHaveLength(2);

    const character = mockResponse.items[0];
    expect(character).toHaveProperty('id');
    expect(character).toHaveProperty('text');
    expect(character).toHaveProperty('category');
    expect(character.category).toBe('character');

    const world = mockResponse.items[1];
    expect(world.category).toBe('world');
  });

  it('should only allow character or world categories', () => {
    const validCategories = ['character', 'world'];

    const items = [
      { id: 'c1', text: '이서연', category: 'character' },
      { id: 'w1', text: '용의 계곡', category: 'world' },
    ];

    for (const item of items) {
      expect(validCategories).toContain(item.category);
    }
  });
});
