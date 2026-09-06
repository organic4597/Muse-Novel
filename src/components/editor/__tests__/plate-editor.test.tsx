import { render } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  editor: {
    api: {
      isExpanded: vi.fn(() => false),
    },
    getOptions: vi.fn(() => ({ chatOptions: {} })),
    getApi: vi.fn(() => ({ inlineSuggestion: { clearSuggestion: vi.fn() } })),
    setOption: vi.fn(),
    tf: {
      collapse: vi.fn(),
      focus: vi.fn(),
      insertFragment: vi.fn(),
    },
    selection: null,
  },
  flush: vi.fn(() => Promise.resolve()),
  normalizeNodeId: vi.fn((value: unknown) => value),
  processValue: vi.fn(),
  usePlateEditor: vi.fn(),
}));

vi.mock('platejs', () => ({
  normalizeNodeId: mocks.normalizeNodeId,
}));

vi.mock('platejs/react', () => ({
  Plate: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePlateEditor: mocks.usePlateEditor,
}));

vi.mock('@/components/editor/editor-kit', () => ({ EditorKit: [] }));
vi.mock('@/components/editor/plugins/ai-kit', () => ({
  aiChatPlugin: { key: 'aiChat' },
}));
vi.mock('@/components/editor/plugins/inline-suggestion-plugin', () => ({
  InlineSuggestionPlugin: { key: 'inlineSuggestion' },
}));
vi.mock('@/components/editor/use-editor-content-worker', () => ({
  useEditorContentWorker: () => ({
    flush: mocks.flush,
    processValue: mocks.processValue,
  }),
}));
vi.mock('@/components/ui/editor', () => ({
  Editor: () => <div data-testid="editor" />,
  EditorContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { PlateEditor, type PlateEditorHandle } from '../plate-editor';

describe('PlateEditor content initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeNodeId.mockImplementation((value: unknown) => value);
    mocks.usePlateEditor.mockReturnValue(mocks.editor);
    mocks.editor.getOptions.mockReturnValue({ chatOptions: {} });
    mocks.editor.selection = null;
  });

  it('keeps the editor value across same-chapter updates and rebuilds only for chapter changes', () => {
    const firstContent = JSON.stringify([
      { children: [{ text: '첫 원고' }], type: 'p' },
    ]);
    const secondContent = JSON.stringify([
      { children: [{ text: '수정된 원고' }], type: 'p' },
    ]);

    const { rerender } = render(
      <PlateEditor chapterId="chapter-1" content={firstContent} />
    );
    const firstValue = mocks.usePlateEditor.mock.calls[0]?.[0].value;

    rerender(
      <PlateEditor
        chapterId="chapter-1"
        content={firstContent}
        onStatsChange={() => undefined}
      />
    );

    expect(mocks.normalizeNodeId).toHaveBeenCalledTimes(1);
    expect(mocks.processValue).toHaveBeenCalledTimes(1);
    expect(mocks.usePlateEditor.mock.calls[1]?.[0].value).toBe(firstValue);

    rerender(<PlateEditor chapterId="chapter-1" content={secondContent} />);

    expect(mocks.normalizeNodeId).toHaveBeenCalledTimes(1);
    expect(mocks.processValue).toHaveBeenCalledTimes(1);
    expect(mocks.usePlateEditor.mock.calls[2]?.[0].value).toBe(firstValue);

    rerender(<PlateEditor chapterId="chapter-2" content={secondContent} />);

    expect(mocks.normalizeNodeId).toHaveBeenCalledTimes(2);
    expect(mocks.processValue).toHaveBeenCalledTimes(2);
    expect(mocks.usePlateEditor.mock.calls[3]?.[1]).toEqual([
      'chapter-2',
    ]);
  });

  it('falls back to an empty paragraph when persisted JSON is malformed', () => {
    expect(() =>
      render(<PlateEditor chapterId="chapter-1" content="{malformed" />)
    ).not.toThrow();

    expect(mocks.normalizeNodeId).toHaveBeenCalledWith([
      { children: [{ text: '' }], type: 'p' },
    ]);
  });

  it('collapses a selection and inserts AI prose as plain paragraphs', () => {
    mocks.editor.api.isExpanded.mockReturnValue(true);
    const ref = createRef<PlateEditorHandle>();
    render(<PlateEditor chapterId="chapter-1" ref={ref} />);

    ref.current?.insertText('# 제목이 아닌 문장\n---\n다음 문단');

    expect(mocks.editor.tf.collapse).toHaveBeenCalledWith({ edge: 'end' });
    expect(mocks.editor.tf.insertFragment).toHaveBeenCalledWith([
      { children: [{ text: '# 제목이 아닌 문장' }], type: 'p' },
      { children: [{ text: '---' }], type: 'p' },
      { children: [{ text: '다음 문단' }], type: 'p' },
    ]);
  });

  it('restores the last editor selection before inserting AI prose', () => {
    const selection = { anchor: { path: [0, 0], offset: 2 }, focus: { path: [0, 0], offset: 2 } };
    (mocks.editor as unknown as { selection: typeof selection | null }).selection = selection;
    const ref = createRef<PlateEditorHandle>();
    render(<PlateEditor chapterId="chapter-1" ref={ref} />);
    ref.current?.insertText('중간에 삽입');
    expect(mocks.editor.tf.focus).toHaveBeenCalledWith({ at: selection });
  });

  it('turns Ghost Text off through the existing plugin option and clears a pending suggestion', () => {
    render(<PlateEditor chapterId="chapter-1" ghostTextEnabled={false} />);
    expect(mocks.editor.setOption).toHaveBeenCalledWith(expect.anything(), 'enabled', false);
    expect(mocks.editor.getApi).toHaveBeenCalled();
    expect(mocks.editor.getApi.mock.results[0]?.value.inlineSuggestion.clearSuggestion).toHaveBeenCalled();
  });
});
