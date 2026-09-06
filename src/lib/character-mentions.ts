// Extract all text from Plate.js JSON content
export function extractTextFromPlateJson(json: string | null): string {
  if (!json) return '';
  try {
    const nodes = JSON.parse(json) as unknown[];
    return extractTextFromNodes(nodes);
  } catch {
    return '';
  }
}

function extractTextFromNodes(nodes: unknown[]): string {
  return nodes
    .map((node) => {
      if (typeof node !== 'object' || node === null) return '';
      const n = node as Record<string, unknown>;
      if (typeof n.text === 'string') return n.text;
      if (Array.isArray(n.children)) return extractTextFromNodes(n.children);
      return '';
    })
    .join('');
}
