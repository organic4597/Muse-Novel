import { z } from 'zod';
import { extractBoundedPlateText } from '@/lib/editor/bounded-plate-content';

export const AUTHOR_NOTE_KINDS = ['text', 'mindmap'] as const;
export type AuthorNoteKind = (typeof AUTHOR_NOTE_KINDS)[number];

export const authorNoteTitleSchema = z.string().trim().min(1).max(160);
export const authorNoteFolderNameSchema = z.string().trim().min(1).max(100);

export const textNoteContentSchema = z.object({
  text: z.string().max(500_000),
  editorJson: z.string().max(2_000_000).refine(value => {
    try { extractBoundedPlateText(value, { maxTextChars: 500_000 }); return true; }
    catch { return false; }
  }, '노트 편집기 데이터 형식이 올바르지 않습니다.').optional(),
}).transform(value => value.editorJson
  ? { ...value, text: extractBoundedPlateText(value.editorJson, { maxTextChars: 500_000 }) }
  : value);

export function getTextNoteEditorJson(content: { text: string; editorJson?: string }) {
  return content.editorJson ?? JSON.stringify(content.text.replace(/\r\n?/gu, '\n').split('\n').map(text => ({ type: 'p', children: [{ text }] })));
}

export const mindMapNodeSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  height: z.number().finite().min(80).max(800).default(140),
  id: z.string().uuid(),
  imagePath: z
    .string()
    .regex(/^\/uploads\/author-notes\/[a-f0-9-]+\.webp$/)
    .optional(),
  kind: z.enum(['text', 'image']),
  text: z.string().max(10_000),
  width: z.number().finite().min(140).max(800).default(240),
  x: z.number().finite().min(-20_000).max(20_000),
  y: z.number().finite().min(-20_000).max(20_000),
});

export const mindMapEdgeSchema = z.object({
  from: z.string().uuid(),
  id: z.string().uuid(),
  to: z.string().uuid(),
});

export const mindMapContentSchema = z
  .object({
    edges: z.array(mindMapEdgeSchema).max(1000),
    nodes: z.array(mindMapNodeSchema).max(500),
  })
  .superRefine((value, context) => {
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const uniqueNodeIds = nodeIds.size === value.nodes.length;
    if (!uniqueNodeIds) {
      context.addIssue({ code: 'custom', message: '마인드맵 노드 ID가 중복됩니다.' });
    }
    const edgeIds = new Set<string>();
    for (const edge of value.edges) {
      if (edgeIds.has(edge.id)) {
        context.addIssue({ code: 'custom', message: '마인드맵 연결선 ID가 중복됩니다.' });
      }
      edgeIds.add(edge.id);
      if (
        edge.from === edge.to ||
        !nodeIds.has(edge.from) ||
        !nodeIds.has(edge.to)
      ) {
        context.addIssue({ code: 'custom', message: '연결선의 노드를 확인해주세요.' });
      }
    }
  });

export type TextNoteContent = z.infer<typeof textNoteContentSchema>;
export type MindMapContent = z.infer<typeof mindMapContentSchema>;
export type MindMapNode = z.infer<typeof mindMapNodeSchema>;
export type MindMapEdge = z.infer<typeof mindMapEdgeSchema>;

export function defaultAuthorNoteContent(kind: AuthorNoteKind) {
  return kind === 'text'
    ? ({ text: '' } satisfies TextNoteContent)
    : ({ edges: [], nodes: [] } satisfies MindMapContent);
}

export function parseAuthorNoteContent(kind: AuthorNoteKind, value: unknown) {
  return kind === 'text'
    ? textNoteContentSchema.parse(value)
    : mindMapContentSchema.parse(value);
}

export function parseStoredAuthorNoteContent(
  kind: AuthorNoteKind,
  contentJson: string
) {
  return parseAuthorNoteContent(kind, JSON.parse(contentJson) as unknown);
}
