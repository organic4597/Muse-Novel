'use client';

import { cleanDocx } from '@platejs/docx';
import type { PlateEditor } from 'platejs/react';

export interface ClipboardHtmlSnapshot {
  html: string;
  rtf: string;
}

type ClipboardDataReader = Pick<DataTransfer, 'getData'>;

type HtmlTransformer = (context: { data: string }) => string;

interface JuicePluginShape {
  inject?: {
    plugins?: {
      html?: {
        parser?: {
          transformData?: HtmlTransformer;
        };
      };
    };
  };
}

const WORD_HTML_PATTERN = /(?:class=["']?Mso|mso-|urn:schemas-microsoft-com:office)/i;
const STYLE_TAG_PATTERN = /<style(?:\s|>)/i;

/**
 * Juice was previously run for every HTML paste. Inline CSS processing only
 * changes HTML with stylesheet rules, while Word HTML additionally needs its
 * mso/RTF cleanup path.
 */
export function shouldProcessOptionalHtmlPaste(
  dataTransfer: ClipboardDataReader
): boolean {
  const html = dataTransfer.getData('text/html');

  if (!html) return false;

  return (
    Boolean(dataTransfer.getData('text/rtf')) ||
    WORD_HTML_PATTERN.test(html) ||
    STYLE_TAG_PATTERN.test(html)
  );
}

export function snapshotClipboardHtml(
  dataTransfer: ClipboardDataReader
): ClipboardHtmlSnapshot {
  return {
    html: dataTransfer.getData('text/html'),
    rtf: dataTransfer.getData('text/rtf'),
  };
}

/**
 * Process the uncommon, expensive rich-paste path after the synchronous
 * clipboard event. The DOCX plugin remains registered so its element parser
 * can preserve Word list and indentation metadata.
 */
export async function insertOptionalHtmlPaste(
  editor: PlateEditor,
  clipboard: ClipboardHtmlSnapshot
) {
  const cleanedHtml = cleanDocx(clipboard.html, clipboard.rtf);
  const { JuicePlugin } = await import('@platejs/juice');
  const plugin = JuicePlugin as unknown as JuicePluginShape;
  const transformData =
    plugin.inject?.plugins?.html?.parser?.transformData;
  const inlinedHtml = transformData
    ? transformData({ data: cleanedHtml })
    : cleanedHtml;
  const fragment = editor.api.html.deserialize({ element: inlinedHtml });

  if (fragment.length > 0) editor.tf.insertFragment(fragment);
}
