export type WritingKnowledgeIndexDocument = {
  category: string;
  content: string;
  domains?: string[];
  expertise?: string;
  genres?: string[];
  id: string;
  kind?: string;
  license?: string;
  sourceUrl?: string;
  summary: string;
  tags: string[];
  title: string;
};

export type WritingKnowledgeIndexPayload = {
  categories: string[];
  documents: WritingKnowledgeIndexDocument[];
  total: number;
  version: string;
};

export type WritingKnowledgeClientSearchOptions = {
  category?: string;
  genre?: string;
  kind?: string;
  limit?: number;
  storyContext?: string;
};

export type WritingKnowledgeClientMatch = Pick<
  WritingKnowledgeIndexDocument,
  'category' | 'id' | 'kind' | 'summary' | 'title'
> & {
  score: number;
};

export type WritingKnowledgeClientSearchResult = {
  matches: WritingKnowledgeClientMatch[];
  queries: string[];
  version: string;
};

export type PreparedWritingKnowledgeIndex = {
  documents: Array<{
    content: string;
    document: WritingKnowledgeIndexDocument;
    facets: string;
    sourceKey: string;
    summary: string;
    tags: string;
    title: string;
  }>;
  version: string;
};

export type WritingKnowledgeWorkerRequest =
  | {
      endpoint: string;
      requestId: string;
      type: 'initialize' | 'refresh';
    }
  | {
      options?: WritingKnowledgeClientSearchOptions;
      query: string;
      requestId: string;
      type: 'search';
    };

export type WritingKnowledgeWorkerResponse =
  | {
      requestId: string;
      source: 'cache' | 'network';
      stale: boolean;
      total: number;
      type: 'index-ready';
      version: string;
    }
  | ({ requestId: string; type: 'search-results' } & WritingKnowledgeClientSearchResult)
  | {
      message: string;
      requestId: string;
      type: 'error';
    };

const QUERY_EXPANSIONS: Array<{ pattern: RegExp; query: string }> = [
  {
    pattern: /(대사|대화|말투|독백|서브텍스트)/u,
    query: '대사 목적 서브텍스트 말투 갈등 정보 전달',
  },
  {
    pattern: /(전투|싸움|액션|부상|추격)/u,
    query: '전투 동선 지형 체력 부상 후유증 액션 장면',
  },
  {
    pattern: /(인물|캐릭터|관계|감정|성장|욕망)/u,
    query: '인물 욕망 결핍 관계 감정 변화 캐릭터 아크',
  },
  {
    pattern: /(세계관|배경|도시|지역|종파|조직|세력)/u,
    query: '세계관 규칙 조직 정치 경제 생활 갈등',
  },
  {
    pattern: /(플롯|전개|반전|결말|복선|사건)/u,
    query: '플롯 인과 전환점 복선 회수 선택 대가 결말',
  },
  {
    pattern: /(묘사|감각|풍경|공간|분위기)/u,
    query: '감각 묘사 관점 공간 분위기 구체적 디테일',
  },
  {
    pattern: /(긴장|속도|페이싱|클리프행어|회차)/u,
    query: '긴장 페이싱 문장 리듬 회차 훅 클리프행어',
  },
  {
    pattern: /(일관|연속|설정 충돌|타임라인|시점|시제|문체)/u,
    query: '장편 일관성 연속성 시점 시제 문체 설정 충돌',
  },
  {
    pattern: /(종교|불교|소림|사찰|신앙|의례|신화)/u,
    query: '종교 불교 신앙 의례 계율 사찰 문화 갈등',
  },
];

function normalize(value: string) {
  return value.toLocaleLowerCase('ko-KR');
}

function tokenize(value: string) {
  const terms = normalize(value)
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

export function expandWritingKnowledgeQueries(
  query: string,
  storyContext = '',
  genre = ''
) {
  const baseQuery = [genre, query].filter(Boolean).join(' ').trim();
  if (!baseQuery) return [];

  const queries = [baseQuery];
  const expansionTarget = `${query}\n${storyContext}`;
  for (const expansion of QUERY_EXPANSIONS) {
    if (expansion.pattern.test(expansionTarget)) {
      queries.push([genre, expansion.query].filter(Boolean).join(' '));
    }
    if (queries.length >= 4) break;
  }
  if (
    queries.length === 1 &&
    /(이어|계속|작성|써|장면|문장|다듬|고쳐)/u.test(query)
  ) {
    queries.push(
      [genre, '장면 목표 갈등 선택 결과 문체 일관성'].filter(Boolean).join(' ')
    );
  }
  return queries;
}

export function isWritingKnowledgeIndexPayload(
  value: unknown
): value is WritingKnowledgeIndexPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WritingKnowledgeIndexPayload>;
  if (
    typeof candidate.version !== 'string' ||
    !candidate.version ||
    !Array.isArray(candidate.categories) ||
    !Array.isArray(candidate.documents) ||
    candidate.documents.length > 5000 ||
    candidate.total !== candidate.documents.length
  ) {
    return false;
  }

  return candidate.documents.every(
    (document) =>
      document &&
      typeof document.category === 'string' &&
      typeof document.content === 'string' &&
      typeof document.id === 'string' &&
      typeof document.summary === 'string' &&
      Array.isArray(document.tags) &&
      typeof document.title === 'string'
  );
}

export function prepareWritingKnowledgeIndex(
  payload: WritingKnowledgeIndexPayload
): PreparedWritingKnowledgeIndex {
  return {
    documents: payload.documents.map((document) => ({
      content: normalize(document.content),
      document,
      facets: normalize(
        [
          document.kind,
          document.expertise,
          ...(document.genres ?? []),
          ...(document.domains ?? []),
        ]
          .filter(Boolean)
          .join(' ')
      ),
      sourceKey: document.sourceUrl || document.id,
      summary: normalize(document.summary),
      tags: normalize(document.tags.join(' ')),
      title: normalize(document.title),
    })),
    version: payload.version,
  };
}

function scorePreparedDocument(
  document: PreparedWritingKnowledgeIndex['documents'][number],
  query: string
) {
  const normalizedQuery = normalize(query).trim();
  if (!normalizedQuery) return 0;

  let score = document.title.includes(normalizedQuery) ? 20 : 0;
  if (document.summary.includes(normalizedQuery)) score += 10;
  if (document.content.includes(normalizedQuery)) score += 5;
  for (const term of tokenize(normalizedQuery)) {
    if (document.title.includes(term)) score += 8;
    if (document.tags.includes(term)) score += 6;
    if (document.facets.includes(term)) score += 7;
    if (document.summary.includes(term)) score += 4;
    if (document.content.includes(term)) score += 1;
  }
  return score;
}

export function searchPreparedWritingKnowledge(
  index: PreparedWritingKnowledgeIndex,
  query: string,
  options: WritingKnowledgeClientSearchOptions = {}
): WritingKnowledgeClientSearchResult {
  const queries = expandWritingKnowledgeQueries(
    query.slice(0, 2000),
    options.storyContext?.slice(-2000),
    options.genre
  );
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));
  if (queries.length === 0) {
    return { matches: [], queries: [], version: index.version };
  }

  const ranked = index.documents
    .filter(({ document }) => {
      if (options.category && document.category !== options.category) return false;
      if (options.kind && document.kind !== options.kind) return false;
      if (options.genre && !document.genres?.includes(options.genre)) return false;
      return true;
    })
    .map((document) => {
      const queryScores = queries.map((expandedQuery, queryIndex) => {
        const weight = queryIndex === 0 ? 1 : 0.85;
        return scorePreparedDocument(document, expandedQuery) * weight;
      });
      return { document, score: Math.max(...queryScores) };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.document.document.title.localeCompare(b.document.document.title, 'ko')
    );

  const selected: typeof ranked = [];
  const usedSources = new Set<string>();
  for (const candidate of ranked) {
    if (usedSources.has(candidate.document.sourceKey)) continue;
    selected.push(candidate);
    usedSources.add(candidate.document.sourceKey);
    if (selected.length >= limit) break;
  }
  if (selected.length < limit) {
    for (const candidate of ranked) {
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
      if (selected.length >= limit) break;
    }
  }

  return {
    matches: selected.map(({ document, score }) => ({
      category: document.document.category,
      id: document.document.id,
      kind: document.document.kind,
      score: Math.round(score * 100) / 100,
      summary: document.document.summary,
      title: document.document.title,
    })),
    queries,
    version: index.version,
  };
}
