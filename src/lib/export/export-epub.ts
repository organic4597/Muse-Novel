/**
 * Convert Plate JSON to HTML and generate EPUB
 * Server-side implementation using epub-gen-memory
 */

import { EPub } from 'epub-gen-memory';
import type { PlateNode, TextNode } from './export-text';

/**
 * Convert a text node's children to HTML string
 * Handles bold and italic inline formatting
 */
function childrenToHtml(
  children: Array<TextNode | PlateNode> | undefined
): string {
  if (!children || children.length === 0) {
    return '';
  }

  return children
    .map((child) => {
      if ('text' in child) {
        const node = child as TextNode & { bold?: boolean; italic?: boolean };
        let text = node.text;

        if (!text) return '';

        if (node.italic) {
          text = `<em>${text}</em>`;
        }
        if (node.bold) {
          text = `<strong>${text}</strong>`;
        }

        return text;
      }
      // Nested block node — recurse
      if ('children' in child) {
        return childrenToHtml(
          (child as PlateNode).children as Array<TextNode | PlateNode>
        );
      }
      return '';
    })
    .join('');
}

/**
 * Convert a single Plate node to an HTML string
 */
function nodeToHtml(node: PlateNode): string {
  const inner = childrenToHtml(node.children);

  if (!inner) {
    return '';
  }

  switch (node.type) {
    case 'h1':
      return `<h1>${inner}</h1>`;
    case 'h2':
      return `<h2>${inner}</h2>`;
    case 'h3':
      return `<h3>${inner}</h3>`;
    case 'p':
    default:
      return `<p>${inner}</p>`;
  }
}

/**
 * Convert Plate JSON nodes to an HTML string
 * @param contentJson - Plate JSON array (parsed from DB or raw) or null
 * @returns HTML string representation
 */
export function convertToHtml(contentJson: unknown): string {
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

  return nodes
    .map((node) => nodeToHtml(node))
    .filter((html) => html.length > 0)
    .join('');
}

/**
 * Generate an EPUB file from project metadata and chapters
 * @param project - Project with title and optional author
 * @param chapters - Array of chapters with title and Plate JSON content
 * @returns Buffer containing the EPUB file bytes
 */
export async function generateEpub(
  project: { title: string; author?: string },
  chapters: { title: string; contentJson: string | null }[]
): Promise<Buffer> {
  const options = {
    title: project.title,
    author: project.author || '작성자',
  };

  // Ensure there's at least one chapter (epub-gen-memory requires content)
  const content =
    chapters.length > 0
      ? chapters.map((ch) => ({
          title: ch.title,
          content: convertToHtml(ch.contentJson) || `<p>${ch.title}</p>`,
        }))
      : [{ title: project.title, content: `<p>${project.title}</p>` }];

  const epub = new EPub(options, content);
  const buffer = await epub.genEpub();
  return buffer;
}
