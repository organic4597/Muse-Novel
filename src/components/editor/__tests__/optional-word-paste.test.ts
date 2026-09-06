import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cleanDocx: vi.fn((html: string) => `cleaned:${html}`),
  deserialize: vi.fn(() => [{ children: [{ text: '붙여넣기' }], type: 'p' }]),
  insertFragment: vi.fn(),
  transformData: vi.fn(({ data }: { data: string }) => `inlined:${data}`),
}));

vi.mock('@platejs/docx', () => ({ cleanDocx: mocks.cleanDocx }));
vi.mock('@platejs/juice', () => ({
  JuicePlugin: {
    inject: {
      plugins: {
        html: { parser: { transformData: mocks.transformData } },
      },
    },
  },
}));

import type { PlateEditor } from 'platejs/react';

import {
  insertOptionalHtmlPaste,
  shouldProcessOptionalHtmlPaste,
  snapshotClipboardHtml,
} from '../optional-word-paste';

function clipboardData(values: Record<string, string>) {
  return {
    getData: (type: string) => values[type] ?? '',
  } as Pick<DataTransfer, 'getData'>;
}

describe('optional rich HTML paste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only selects clipboard HTML that needs Word cleanup or CSS inlining', () => {
    expect(
      shouldProcessOptionalHtmlPaste(
        clipboardData({ 'text/html': '<p>일반 HTML</p>' })
      )
    ).toBe(false);
    expect(
      shouldProcessOptionalHtmlPaste(
        clipboardData({ 'text/html': '<p class="MsoNormal">Word</p>' })
      )
    ).toBe(true);
    expect(
      shouldProcessOptionalHtmlPaste(
        clipboardData({
          'text/html': '<style>p { color: red }</style><p>Styled</p>',
        })
      )
    ).toBe(true);
    expect(
      shouldProcessOptionalHtmlPaste(
        clipboardData({
          'text/html': '<p>RTF-backed</p>',
          'text/rtf': '{\\rtf1}',
        })
      )
    ).toBe(true);
  });

  it('snapshots clipboard strings before asynchronous processing', () => {
    expect(
      snapshotClipboardHtml(
        clipboardData({
          'text/html': '<p>본문</p>',
          'text/rtf': '{\\rtf1 본문}',
        })
      )
    ).toEqual({ html: '<p>본문</p>', rtf: '{\\rtf1 본문}' });
  });

  it('loads the CSS inliner, deserializes, and inserts the cleaned fragment', async () => {
    const editor = {
      api: { html: { deserialize: mocks.deserialize } },
      tf: { insertFragment: mocks.insertFragment },
    } as unknown as PlateEditor;

    await insertOptionalHtmlPaste(editor, {
      html: '<p class="MsoNormal">본문</p>',
      rtf: '{\\rtf1}',
    });

    expect(mocks.cleanDocx).toHaveBeenCalledWith(
      '<p class="MsoNormal">본문</p>',
      '{\\rtf1}'
    );
    expect(mocks.transformData).toHaveBeenCalledWith({
      data: 'cleaned:<p class="MsoNormal">본문</p>',
    });
    expect(mocks.deserialize).toHaveBeenCalledWith({
      element: 'inlined:cleaned:<p class="MsoNormal">본문</p>',
    });
    expect(mocks.insertFragment).toHaveBeenCalledWith([
      { children: [{ text: '붙여넣기' }], type: 'p' },
    ]);
  });
});
