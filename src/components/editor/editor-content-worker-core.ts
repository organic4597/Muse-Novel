import { convertToPlainText } from '@/lib/export/export-text';

export interface EditorTextStats {
  byteSize: number;
  characterCount: number;
}

export interface ProcessedEditorContent extends EditorTextStats {
  content: string;
  plainText: string;
}

export interface EditorContentWorkerRequest {
  requestId: number;
  value: unknown;
}

export type EditorContentWorkerResponse =
  | {
      requestId: number;
      result: ProcessedEditorContent;
      success: true;
    }
  | {
      error: string;
      requestId: number;
      success: false;
    };

/**
 * Performs the expensive, editor-value-wide work in one pass target.
 * This function lives separately from the worker entry so it can also serve as
 * a compatibility fallback in browsers that block module workers.
 */
export function processEditorContent(value: unknown): ProcessedEditorContent {
  const content = JSON.stringify(value);

  if (typeof content !== 'string') {
    throw new TypeError('편집기 내용을 JSON으로 변환할 수 없습니다.');
  }

  const plainText = convertToPlainText(value);

  return {
    byteSize: new TextEncoder().encode(plainText).length,
    characterCount: plainText.length,
    content,
    plainText,
  };
}
