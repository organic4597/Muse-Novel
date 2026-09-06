const DEFAULT_PREFIX_MAX = 1500;
const DEFAULT_SUFFIX_MAX = 500;

interface PlateNode {
  type?: string;
  text?: string;
  children?: PlateNode[];
}

/**
 * Plate JSON 노드 트리에서 평문 텍스트를 재귀적으로 추출합니다.
 */
function extractText(nodes: PlateNode[]): string {
  const parts: string[] = [];

  for (const node of nodes) {
    if (typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (node.children) {
      parts.push(extractText(node.children));
    }
  }

  return parts.join('');
}

/**
 * Plate JSON 에디터 콘텐츠에서 커서 위치 기준으로 prefix/suffix를 추출합니다.
 *
 * - `editorContent`: Plate JSON 문자열 (배열 형태)
 * - `cursorOffset`: 평문 텍스트 기준 커서 위치. 없으면 전체가 prefix
 * - `maxContext`: prefix 최대 길이 (기본 1500자). suffix는 항상 최대 500자
 */
export function serializeEditorContext(
  editorContent: string,
  cursorOffset?: number,
  maxContext: number = DEFAULT_PREFIX_MAX
): { prefix: string; suffix: string } {
  if (!editorContent) {
    return { prefix: '', suffix: '' };
  }

  let nodes: PlateNode[];

  try {
    const parsed = JSON.parse(editorContent);

    if (!Array.isArray(parsed)) {
      return { prefix: '', suffix: '' };
    }

    nodes = parsed;
  } catch {
    return { prefix: '', suffix: '' };
  }

  // 블록 노드를 개행으로 연결
  const blockTexts: string[] = [];

  for (const node of nodes) {
    if (node.children) {
      blockTexts.push(extractText(node.children));
    } else if (typeof node.text === 'string') {
      blockTexts.push(node.text);
    }
  }

  const fullText = blockTexts.join('\n');

  if (!fullText) {
    return { prefix: '', suffix: '' };
  }

  let prefix: string;
  let suffix: string;

  if (cursorOffset === undefined || cursorOffset === null) {
    prefix = fullText;
    suffix = '';
  } else if (cursorOffset >= fullText.length) {
    prefix = fullText;
    suffix = '';
  } else {
    prefix = fullText.slice(0, cursorOffset);
    suffix = fullText.slice(cursorOffset);
  }

  // Truncation: prefix → last maxContext chars, suffix → first 500 chars
  if (prefix.length > maxContext) {
    prefix = prefix.slice(-maxContext);
  }
  if (suffix.length > DEFAULT_SUFFIX_MAX) {
    suffix = suffix.slice(0, DEFAULT_SUFFIX_MAX);
  }

  return { prefix, suffix };
}
