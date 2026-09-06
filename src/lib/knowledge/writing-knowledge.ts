import fs from 'node:fs';
import path from 'node:path';

export type WritingKnowledgeDocument = {
  category: string;
  content: string;
  domains?: string[];
  expertise?: string;
  filePath: string;
  genres?: string[];
  id: string;
  kind?: string;
  license?: string;
  sourceUrl?: string;
  summary: string;
  tags: string[];
  title: string;
};

export type WritingKnowledgeSearchOptions = {
  category?: string;
  genre?: string;
  kind?: string;
  limit?: number;
};

export type WritingKnowledgeAgentResult = {
  context: string;
  matches: Pick<
    WritingKnowledgeDocument,
    'category' | 'id' | 'kind' | 'summary' | 'title'
  >[];
  queries: string[];
};

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const CACHE_VALIDATION_INTERVAL_MS = 30_000;
let cachedSignature = '';
let cachedDocuments: WritingKnowledgeDocument[] = [];
let cachedCheckedAt = 0;

export function getWritingKnowledgeRoot() {
  return process.env.WRITING_KNOWLEDGE_DIR
    ? path.resolve(process.env.WRITING_KNOWLEDGE_DIR)
    : path.join(process.cwd(), 'knowledge', 'writing');
}

function findMarkdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md'
        ? [entryPath]
        : [];
    })
    .sort();
}

function parseArray(value: string) {
  const normalized = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function parseFrontmatter(raw: string) {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return null;

  const metadata = new Map<string, string>();
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    metadata.set(
      line.slice(0, separator).trim(),
      line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    );
  }

  return {
    body: raw.slice(match[0].length).trim(),
    metadata,
  };
}

function readDocument(filePath: string): WritingKnowledgeDocument | null {
  const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf8'));
  if (!parsed) return null;

  const id = parsed.metadata.get('id');
  const title = parsed.metadata.get('title');
  const category = parsed.metadata.get('category');
  const summary = parsed.metadata.get('summary');
  if (!(id && title && category && summary && parsed.body)) return null;
  const content = parsed.body.replace(/^#\s+[^\r\n]+\r?\n+/, '').trim();

  return {
    category,
    content,
    domains: parseArray(parsed.metadata.get('domains') ?? ''),
    expertise: parsed.metadata.get('expertise'),
    filePath,
    genres: parseArray(parsed.metadata.get('genres') ?? ''),
    id,
    kind: parsed.metadata.get('kind') ?? 'craft',
    license: parsed.metadata.get('license'),
    sourceUrl: parsed.metadata.get('sourceUrl'),
    summary,
    tags: parseArray(parsed.metadata.get('tags') ?? ''),
    title,
  };
}

function buildSignature(root: string, files: string[]) {
  return `${root}|${files.map((file) => {
    const stat = fs.statSync(file);
    return `${file}:${stat.mtimeMs}:${stat.size}`;
  }).join('|')}`;
}

export function loadWritingKnowledge() {
  if (
    process.env.NODE_ENV !== 'test' &&
    cachedSignature &&
    Date.now() - cachedCheckedAt < CACHE_VALIDATION_INTERVAL_MS
  ) {
    return cachedDocuments;
  }

  const root = getWritingKnowledgeRoot();
  const files = findMarkdownFiles(root);
  const signature = buildSignature(root, files);
  cachedCheckedAt = Date.now();
  if (signature === cachedSignature) return cachedDocuments;

  const documents = files
    .map(readDocument)
    .filter((document): document is WritingKnowledgeDocument => Boolean(document));
  const uniqueIds = new Set<string>();
  cachedDocuments = documents.filter((document) => {
    if (uniqueIds.has(document.id)) return false;
    uniqueIds.add(document.id);
    return true;
  });
  cachedSignature = signature;
  return cachedDocuments;
}

function tokenize(value: string) {
  const terms = value.toLocaleLowerCase('ko-KR')
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const expanded = terms.flatMap((term) => {
    if (!/[가-힣]/u.test(term)) return [term];
    const stem = term.replace(
      /(에서|에게|으로|부터|까지|처럼|보다|하고|하며|하는|하기|방법|과|와|을|를|이|가|은|는|의|에|도|만)$/u,
      ''
    );
    return stem.length >= 2 && stem !== term ? [term, stem] : [term];
  });
  return Array.from(new Set(expanded));
}

function scoreDocument(document: WritingKnowledgeDocument, query: string) {
  const normalizedQuery = query.toLocaleLowerCase('ko-KR').trim();
  if (!normalizedQuery) return 1;

  const title = document.title.toLocaleLowerCase('ko-KR');
  const tags = document.tags.join(' ').toLocaleLowerCase('ko-KR');
  const facets = [
    document.kind,
    document.expertise,
    ...(document.genres ?? []),
    ...(document.domains ?? []),
  ].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
  const summary = document.summary.toLocaleLowerCase('ko-KR');
  const content = document.content.toLocaleLowerCase('ko-KR');
  let score = title.includes(normalizedQuery) ? 20 : 0;
  if (summary.includes(normalizedQuery)) score += 10;
  if (content.includes(normalizedQuery)) score += 5;

  for (const term of tokenize(normalizedQuery)) {
    if (title.includes(term)) score += 8;
    if (tags.includes(term)) score += 6;
    if (facets.includes(term)) score += 7;
    if (summary.includes(term)) score += 4;
    if (content.includes(term)) score += 1;
  }
  return score;
}

function scoreKnowledgeExcerpt(excerpt: string, query: string) {
  const normalizedExcerpt = excerpt.toLocaleLowerCase('ko-KR');
  const normalizedQuery = query.toLocaleLowerCase('ko-KR').trim();
  let score = normalizedQuery && normalizedExcerpt.includes(normalizedQuery) ? 12 : 0;

  for (const term of tokenize(normalizedQuery)) {
    if (normalizedExcerpt.includes(term)) score += 2;
  }
  return score;
}

function truncateKnowledgeText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;

  const candidate = value.slice(0, Math.max(1, maxChars - 1));
  const boundary = Math.max(
    candidate.lastIndexOf('\n'),
    candidate.lastIndexOf('.'),
    candidate.lastIndexOf('?'),
    candidate.lastIndexOf('!'),
    candidate.lastIndexOf('。')
  );

  return boundary >= Math.floor(maxChars * 0.55)
    ? candidate.slice(0, boundary + 1).trimEnd()
    : `${candidate.trimEnd()}…`;
}

function selectRelevantExcerpt(
  document: WritingKnowledgeDocument,
  query: string,
  maxChars: number
) {
  const sections = document.content
    .split(/\r?\n\s*\r?\n/u)
    .map((section) => section.trim())
    .filter(Boolean);
  if (sections.length === 0) return '';

  const ranked = sections
    .map((section, index) => ({
      index,
      score: scoreKnowledgeExcerpt(section, query),
      section,
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = ranked
    .filter((item, index) => item.score > 0 || index === 0)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.section)
    .join('\n\n');

  return truncateKnowledgeText(selected, maxChars);
}

export function searchWritingKnowledge(
  query: string,
  options: WritingKnowledgeSearchOptions = {}
) {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  return rankWritingKnowledge(query, options)
    .slice(0, limit)
    .map(({ document }) => document);
}

function rankWritingKnowledge(
  query: string,
  options: WritingKnowledgeSearchOptions = {}
) {
  return loadWritingKnowledge()
    .filter((document) =>
      (!options.category || document.category === options.category) &&
      (!options.kind || document.kind === options.kind) &&
      (!options.genre || document.genres?.includes(options.genre))
    )
    .map((document) => ({ document, score: scoreDocument(document, query) }))
    .filter(({ score }) => !query.trim() || score > 0)
    .sort((a, b) => b.score - a.score || a.document.title.localeCompare(b.document.title, 'ko'));
}

export function getWritingKnowledgeDocument(id: string) {
  return loadWritingKnowledge().find((document) => document.id === id);
}

export function selectWritingKnowledgeDocuments(
  query: string,
  options: WritingKnowledgeSearchOptions = {}
) {
  const limit = Math.max(1, Math.min(options.limit ?? 3, 10));
  const candidates = rankWritingKnowledge(query, {
    ...options,
  }).slice(0, Math.max(50, limit * 8));
  const documents: WritingKnowledgeDocument[] = [];
  const usedKinds = new Set<string>();
  const highestScore = candidates[0]?.score ?? 0;
  const relevanceFloor = Math.max(2, highestScore * 0.35);

  for (const { document, score } of candidates) {
    if (score < relevanceFloor) continue;
    const kind = document.kind ?? 'craft';
    if (usedKinds.has(kind)) continue;
    usedKinds.add(kind);
    documents.push(document);
    if (documents.length === limit) break;
  }
  if (documents.length >= limit) return documents.slice(0, limit);

  for (const { document, score } of candidates) {
    if (score < relevanceFloor) continue;
    if (documents.includes(document)) continue;
    documents.push(document);
    if (documents.length >= limit) break;
  }
  return documents.slice(0, limit);
}

export function buildWritingKnowledgeContext(query: string, maxChars = 2400) {
  if (!query.trim()) return '';
  const documents = selectWritingKnowledgeDocuments(query, { limit: 3 });
  return buildWritingKnowledgeContextFromDocuments(documents, query, maxChars);
}

export function buildWritingKnowledgeContextFromDocuments(
  documents: WritingKnowledgeDocument[],
  query: string,
  maxChars = 2400
) {
  const sections: string[] = [];
  const perDocumentBudget = Math.max(
    180,
    Math.floor(maxChars / Math.max(1, documents.length)) - 120
  );

  for (const document of documents) {
    const excerpt = selectRelevantExcerpt(document, query, perDocumentBudget);
    const section = [
      `### ${document.title}`,
      document.expertise ? `전문가 관점: ${document.expertise}` : '',
      document.summary,
      excerpt,
    ].filter(Boolean).join('\n');
    const currentLength = sections.join('\n\n').length;
    const remaining = maxChars - currentLength - (sections.length > 0 ? 2 : 0);
    if (remaining <= 80) break;
    sections.push(truncateKnowledgeText(section, remaining));
  }

  return sections.join('\n\n');
}

const KNOWLEDGE_QUERY_EXPANSIONS: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /(대사|대화|말투|독백|서브텍스트)/u, query: '대사 목적 서브텍스트 말투 갈등 정보 전달' },
  { pattern: /(전투|싸움|액션|부상|추격)/u, query: '전투 동선 지형 체력 부상 후유증 액션 장면' },
  { pattern: /(인물|캐릭터|관계|감정|성장|욕망)/u, query: '인물 욕망 결핍 관계 감정 변화 캐릭터 아크' },
  { pattern: /(세계관|배경|도시|지역|종파|조직|세력)/u, query: '세계관 규칙 조직 정치 경제 생활 갈등' },
  { pattern: /(플롯|전개|반전|결말|복선|사건)/u, query: '플롯 인과 전환점 복선 회수 선택 대가 결말' },
  { pattern: /(묘사|감각|풍경|공간|분위기)/u, query: '감각 묘사 관점 공간 분위기 구체적 디테일' },
  { pattern: /(긴장|속도|페이싱|클리프행어|회차)/u, query: '긴장 페이싱 문장 리듬 회차 훅 클리프행어' },
  { pattern: /(일관|연속|설정 충돌|타임라인|시점|시제|문체)/u, query: '장편 일관성 연속성 시점 시제 문체 설정 충돌' },
  { pattern: /(종교|불교|소림|사찰|신앙|의례|신화)/u, query: '종교 불교 신앙 의례 계율 사찰 문화 갈등' },
];

export function runWritingKnowledgeAgent({
  category,
  genre = '',
  instruction,
  kind,
  maxChars = 2400,
  storyContext = '',
}: {
  category?: string;
  genre?: string;
  instruction: string;
  kind?: string;
  maxChars?: number;
  storyContext?: string;
}): WritingKnowledgeAgentResult {
  const baseQuery = [genre, instruction].filter(Boolean).join(' ').trim();
  if (!baseQuery) return { context: '', matches: [], queries: [] };

  const queries = [baseQuery];
  for (const expansion of KNOWLEDGE_QUERY_EXPANSIONS) {
    if (expansion.pattern.test(`${instruction}\n${storyContext}`)) {
      queries.push([genre, expansion.query].filter(Boolean).join(' '));
    }
    if (queries.length >= 4) break;
  }
  if (
    queries.length === 1 &&
    /(이어|계속|작성|써|장면|문장|다듬|고쳐)/u.test(instruction)
  ) {
    queries.push([genre, '장면 목표 갈등 선택 결과 문체 일관성'].filter(Boolean).join(' '));
  }

  const documents: WritingKnowledgeDocument[] = [];
  const usedIds = new Set<string>();
  const usedSources = new Set<string>();
  const retrievalQueries = [...queries.slice(1), queries[0]].filter(
    (query): query is string => Boolean(query)
  );
  for (const query of retrievalQueries) {
    for (const document of searchWritingKnowledge(query, {
      category,
      kind,
      limit: 2,
    })) {
      const sourceKey = document.sourceUrl ?? document.id;
      if (usedIds.has(document.id) || usedSources.has(sourceKey)) continue;
      usedIds.add(document.id);
      usedSources.add(sourceKey);
      documents.push(document);
      if (documents.length >= 5) break;
    }
    if (documents.length >= 5) break;
  }

  const presentKinds = new Set(documents.map((document) => document.kind ?? 'craft'));
  const needsDomainReference = /(전투|부상|수사|증거|정치|종파|조직|경제|화폐|물류|의학|질병|종교|신화|역사|고증)/u
    .test(`${instruction}\n${storyContext}`);
  const fallbackSearches: Array<{ kind: string; query: string }> = [
    ...(documents.length > 0
      ? [{ kind: 'craft', query: `${instruction} 장면 작법` }]
      : []),
    ...(genre ? [{ kind: 'genre', query: `${genre} 장르 관습` }] : []),
    ...(needsDomainReference
      ? [{ kind: 'domain', query: `${instruction} 배경 전문 지식` }]
      : []),
  ];
  for (const fallback of fallbackSearches) {
    if (kind && kind !== fallback.kind) continue;
    if (presentKinds.has(fallback.kind) || documents.length >= 5) continue;
    const document = searchWritingKnowledge(fallback.query, {
      category,
      kind: fallback.kind,
      limit: 1,
    })[0];
    const sourceKey = document?.sourceUrl ?? document?.id;
    if (!document || !sourceKey || usedIds.has(document.id) || usedSources.has(sourceKey)) {
      continue;
    }
    usedIds.add(document.id);
    usedSources.add(sourceKey);
    presentKinds.add(fallback.kind);
    documents.push(document);
  }

  const combinedQuery = [...queries, storyContext.slice(-1000)].join(' ');
  return {
    context: buildWritingKnowledgeContextFromDocuments(
      documents,
      combinedQuery,
      maxChars
    ),
    matches: documents.map((document) => ({
      category: document.category,
      id: document.id,
      kind: document.kind,
      summary: document.summary,
      title: document.title,
    })),
    queries,
  };
}

export function resetWritingKnowledgeCacheForTests() {
  cachedCheckedAt = 0;
  cachedSignature = '';
  cachedDocuments = [];
}
