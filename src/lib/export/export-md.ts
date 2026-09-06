/**
 * Convert Plate JSON to Markdown
 * Server-side implementation that manually maps Plate nodes to Markdown syntax
 */

import type { PlateNode, TextNode } from './export-text';

/**
 * Extract text from a node's children
 */
function extractTextFromChildren(
  children: Array<TextNode | PlateNode> | undefined
): string {
  if (!children || children.length === 0) {
    return '';
  }

  return children
    .map((child) => {
      if ('text' in child) {
        return (child as TextNode).text;
      }
      // If it's a nested block node, extract from its children
      if ('children' in child) {
        return extractTextFromChildren(
          (child as PlateNode).children as Array<TextNode | PlateNode>
        );
      }
      return '';
    })
    .join('');
}

/**
 * Convert a single Plate node to Markdown
 */
function nodeToMarkdown(node: PlateNode): string {
  const text = extractTextFromChildren(node.children);

  if (!text) {
    return '';
  }

  switch (node.type) {
    case 'h1':
      return `# ${text}`;
    case 'h2':
      return `## ${text}`;
    case 'h3':
      return `### ${text}`;
    default:
      return text;
  }
}

/**
 * Convert Plate JSON nodes to Markdown
 * @param contentJson - Plate JSON array (parsed from DB) or null
 * @returns Markdown representation
 */
export function convertToMarkdown(contentJson: unknown): string {
  if (!contentJson) {
    return '';
  }

  // Parse if it's a string (from DB)
  let nodes: PlateNode[];
  if (typeof contentJson === 'string') {
    try {
      nodes = JSON.parse(contentJson);
    } catch {
      return '';
    }
  } else if (Array.isArray(contentJson)) {
    nodes = contentJson as PlateNode[];
  } else {
    return '';
  }

  if (nodes.length === 0) {
    return '';
  }

  // Convert each node to markdown
  const lines = nodes
    .map((node) => nodeToMarkdown(node))
    .filter((line) => line.length > 0);

  return lines.join('\n\n');
}
