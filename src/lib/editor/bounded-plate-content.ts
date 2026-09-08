const MAX_NODE_COUNT = 50_000;
const MAX_NODE_DEPTH = 64;
const MAX_TEXT_CHARS = 240_000;

export class InvalidPlateContentError extends Error {
  override name = 'InvalidPlateContentError';
}

/** Parses untrusted editor JSON without recursive traversal or unbounded text. */
export function extractBoundedPlateText(contentJson?: string, options: { maxTextChars?: number } = {}) {
  if (!contentJson) return '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    throw new InvalidPlateContentError('현재 원고 JSON이 올바르지 않습니다.');
  }
  if (!Array.isArray(parsed)) {
    throw new InvalidPlateContentError('현재 원고는 Plate 노드 배열이어야 합니다.');
  }

  let nodeCount = 0;
  let textChars = 0;
  const lines: string[] = [];
  for (const root of parsed) {
    const parts: string[] = [];
    const stack: Array<{ depth: number; node: unknown }> = [
      { depth: 0, node: root },
    ];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      nodeCount += 1;
      if (nodeCount > MAX_NODE_COUNT || current.depth > MAX_NODE_DEPTH) {
        throw new InvalidPlateContentError('현재 원고 구조가 너무 크거나 깊습니다.');
      }
      if (!current.node || typeof current.node !== 'object') {
        throw new InvalidPlateContentError('현재 원고에 잘못된 노드가 있습니다.');
      }
      const node = current.node as Record<string, unknown>;
      if (typeof node.text === 'string') {
        textChars += node.text.length;
        if (textChars > (options.maxTextChars ?? MAX_TEXT_CHARS)) {
          throw new InvalidPlateContentError('현재 원고가 집필 요청 한도를 초과합니다.');
        }
        parts.push(node.text);
      }
      if (node.children !== undefined) {
        if (!Array.isArray(node.children)) {
          throw new InvalidPlateContentError('현재 원고의 children 구조가 올바르지 않습니다.');
        }
        for (let index = node.children.length - 1; index >= 0; index -= 1) {
          stack.push({ depth: current.depth + 1, node: node.children[index] });
        }
      }
    }
    const line = parts.join('');
    if (line) lines.push(line);
  }
  return lines.join('\n');
}
