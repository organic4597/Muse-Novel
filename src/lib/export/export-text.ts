/**
 * Convert Plate JSON to plain text
 * Walks the JSON tree, extracts text nodes, and joins with newlines
 */

export type PlateNode = {
  type: string;
  children?: Array<TextNode | PlateNode>;
  [key: string]: unknown;
};

export type TextNode = {
  text: string;
  [key: string]: unknown;
};

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
 * Convert Plate JSON nodes to plain text
 * @param contentJson - Plate JSON array (parsed from DB) or null
 * @returns Plain text representation
 */
export function convertToPlainText(
  contentJson: unknown
): string {
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

  // Extract text from each node
  const lines = nodes.map((node) => {
    const text = extractTextFromChildren(node.children);
    return text;
  });

  // Filter out empty lines and join with newlines
  return lines.filter((line) => line.length > 0).join('\n');
}
