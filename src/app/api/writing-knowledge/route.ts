import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  getWritingKnowledgeDocument,
  loadWritingKnowledge,
  runWritingKnowledgeAgent,
  searchWritingKnowledge,
} from '@/lib/knowledge/writing-knowledge';

export const dynamic = 'force-dynamic';

type SerializedDocument = ReturnType<typeof serializeDocument>;

let cachedIndexSource: ReturnType<typeof loadWritingKnowledge> | null = null;
let cachedIndexPayload: {
  categories: string[];
  documents: SerializedDocument[];
  total: number;
  version: string;
} | null = null;

function serializeDocument(document: ReturnType<typeof loadWritingKnowledge>[number]) {
  return {
    category: document.category,
    content: document.content,
    domains: document.domains,
    expertise: document.expertise,
    genres: document.genres,
    id: document.id,
    kind: document.kind,
    license: document.license,
    sourceUrl: document.sourceUrl,
    summary: document.summary,
    tags: document.tags,
    title: document.title,
  };
}

function getClientIndex() {
  const source = loadWritingKnowledge();
  if (source === cachedIndexSource && cachedIndexPayload) {
    return cachedIndexPayload;
  }

  const documents = source.map(serializeDocument);
  const version = createHash('sha256')
    .update(JSON.stringify(documents))
    .digest('base64url')
    .slice(0, 22);
  cachedIndexSource = source;
  cachedIndexPayload = {
    categories: Array.from(
      new Set(source.map((document) => document.category))
    ).sort((a, b) => a.localeCompare(b, 'ko')),
    documents,
    total: documents.length,
    version,
  };
  return cachedIndexPayload;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (id) {
    const document = getWritingKnowledgeDocument(id);
    return document
      ? Response.json(serializeDocument(document))
      : Response.json({ error: '문서를 찾을 수 없습니다.' }, { status: 404 });
  }

  if (searchParams.get('mode') === 'index') {
    const payload = getClientIndex();
    const etag = `"${payload.version}"`;
    const headers = {
      'Cache-Control': 'private, max-age=0, must-revalidate',
      ETag: etag,
    };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { headers, status: 304 });
    }
    return Response.json(payload, { headers });
  }

  const query = searchParams.get('q')?.slice(0, 500) ?? '';
  const category = searchParams.get('category')?.slice(0, 100) || undefined;
  const genre = searchParams.get('genre')?.slice(0, 100) || undefined;
  const kind = searchParams.get('kind')?.slice(0, 100) || undefined;
  const requestedLimit = Number(searchParams.get('limit') ?? 20);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 20;
  const documents = searchWritingKnowledge(query, {
    category,
    genre,
    kind,
    limit,
  });

  return Response.json({
    categories: Array.from(
      new Set(loadWritingKnowledge().map((document) => document.category))
    ).sort((a, b) => a.localeCompare(b, 'ko')),
    documents: documents.map(serializeDocument),
    total: documents.length,
  });
}

const searchSchema = z.object({
  category: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(100).optional(),
  kind: z.string().trim().max(100).optional(),
  maxChars: z.number().int().min(200).max(10_000).default(2400),
  query: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = searchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: '검색 요청 형식이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const agentResult = runWritingKnowledgeAgent({
    category: parsed.data.category,
    genre: parsed.data.genre,
    instruction: parsed.data.query,
    kind: parsed.data.kind,
    maxChars: parsed.data.maxChars,
  });
  return Response.json({
    context: agentResult.context,
    matches: agentResult.matches,
    queries: agentResult.queries,
  });
}
