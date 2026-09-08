import { createPlateEditor } from 'platejs/react';
import { describe, expect, it, vi } from 'vitest';

import { InlineSuggestionPlugin } from '../plugins/inline-suggestion-plugin';

function setup() {
  const editor = createPlateEditor({
    plugins: [InlineSuggestionPlugin],
    value: [{ id: 'paragraph', type: 'p', children: [{ text: '앞 문장 뒤 문장' }] }],
  });
  editor.api.redecorate = vi.fn();
  editor.tf.select({ path: [0, 0], offset: 5 });
  editor.getApi(InlineSuggestionPlugin).inlineSuggestion.setSuggestion('추가 구절.', 'paragraph');
  return editor;
}

function press(editor: ReturnType<typeof setup>, key: string, altKey = false) {
  const event = {
    key, code: key, altKey, ctrlKey: false, metaKey: false, shiftKey: false,
    nativeEvent: { isComposing: false, stopImmediatePropagation: vi.fn() },
    preventDefault: vi.fn(), stopPropagation: vi.fn(),
  };
  const plugin = editor.getPlugin(InlineSuggestionPlugin);
  plugin.handlers.onKeyDown?.({
    editor, event,
    getOptions: () => editor.getOptions(InlineSuggestionPlugin),
  } as never);
  return event;
}

describe('Ghost shortcuts at a mid-paragraph caret', () => {
  it('consumes candidate navigation even with one candidate', () => {
    const editor = setup();
    editor.setOption(InlineSuggestionPlugin, 'suggestionCandidates', ['추가 구절 ']);
    const before = structuredClone(editor.selection);
    for (const key of ['ArrowUp', 'ArrowDown']) {
      expect(press(editor, key, true).preventDefault).toHaveBeenCalled();
      expect(editor.selection).toEqual(before);
    }
  });

  it('consumes candidate navigation during generation without moving selection', () => {
    const editor = setup();
    editor.getApi(InlineSuggestionPlugin).inlineSuggestion.clearSuggestion();
    editor.setOption(InlineSuggestionPlugin, 'isLoading', true);
    const before = structuredClone(editor.selection);
    expect(press(editor, 'ArrowUp', true).preventDefault).toHaveBeenCalled();
    expect(editor.selection).toEqual(before);
  });

  it('accepts at the displayed position and keeps the caret after the insertion', () => {
    const editor = setup();
    press(editor, 'Tab');
    expect(editor.api.string([0])).toBe('앞 문장 추가 구절.뒤 문장');
    expect(editor.selection?.focus).toEqual({ path: [0, 0], offset: 11 });
  });

  it('does not insert an old suggestion after the user moves the caret', () => {
    const editor = setup();
    editor.tf.select({ path: [0, 0], offset: 0 });
    press(editor, 'Tab');
    expect(editor.api.string([0])).toBe('앞 문장 뒤 문장');
    expect(editor.selection?.focus.offset).toBe(0);
  });
});
