import { createHash } from 'node:crypto';

import type { DB } from '@/lib/db';
import { listChapters } from '@/lib/db/queries/chapters';
import { listEmotionsForProject } from '@/lib/db/queries/character-emotions';
import { listRelationshipsForProject } from '@/lib/db/queries/character-relationships';
import { listCharacters } from '@/lib/db/queries/characters';
import { getProject } from '@/lib/db/queries/projects';
import {
  deleteStaleMemorySources,
  listSemanticMemoryChunks,
  replaceSemanticMemorySources,
} from '@/lib/db/queries/semantic-memory';
import { listStoryStateEntries } from '@/lib/db/queries/story-state';
import { listPlotBoard } from '@/lib/db/queries/plot-board';
import { listWorldEntriesWithTags } from '@/lib/db/queries/world-entries';
import { convertToPlainText } from '@/lib/export/export-text';
import {
  createEmbeddings,
  createQueryEmbedding,
  getEmbeddingFingerprint,
  getEmbeddingFingerprintPrefix,
  resolveEmbeddingServiceConfig,
} from '@/lib/memory/embedding-client';
import { splitResearchContent } from '@/lib/web-research/content';
import { isStoryStateEffectiveAt } from '@/lib/story-state';
import { formatStoryDate, getStoryCalendar } from '@/lib/story-timeline';
import { PLOT_EDGE_LABELS, PLOT_NODE_LABELS } from '@/lib/plot-board';

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 160;
const EMBEDDING_BATCH_SIZE = 16;

export type ProjectMemorySourceType =
  | 'project'
  | 'chapter'
  | 'character'
  | 'world'
  | 'state'
  | 'plot';

export type ProjectMemorySource = {
  content: string;
  id: string;
  title: string;
  type: ProjectMemorySourceType;
  updatedAt?: Date | null;
};

export type ProjectMemoryIndexResult = {
  chunks: number;
  embeddingAvailable: boolean;
  embeddingError?: string;
  embeddingModel?: string;
  removedSources: number;
  skippedSources: number;
  updatedSources: number;
};

export type ProjectMemoryMatch = {
  content: string;
  lexicalScore: number;
  score: number;
  semanticScore: number | null;
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
};

export type ProjectMemoryRetrievalResult = {
  matches: ProjectMemoryMatch[];
  mode: 'hybrid' | 'keyword';
  warning?: string;
};

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeMemoryText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findChunkBoundary(text: string, start: number, idealEnd: number) {
  if (idealEnd >= text.length) return text.length;

  const floor = start + Math.floor((idealEnd - start) * 0.6);
  const candidates = [
    text.lastIndexOf('\n\n', idealEnd),
    text.lastIndexOf('\n', idealEnd),
    text.lastIndexOf('. ', idealEnd),
    text.lastIndexOf('다. ', idealEnd),
    text.lastIndexOf('? ', idealEnd),
    text.lastIndexOf('! ', idealEnd),
  ];
  const validCandidates = candidates.filter((index) => index >= floor);
  return validCandidates.length > 0 ? Math.max(...validCandidates) : idealEnd;
}

export function chunkMemoryText(
  value: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_CHUNK_OVERLAP
) {
  const text = normalizeMemoryText(value);
  if (!text) return [];

  const safeChunkSize = Math.max(240, Math.trunc(chunkSize));
  const safeOverlap = Math.min(
    safeChunkSize - 80,
    Math.max(0, Math.trunc(overlap))
  );
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const idealEnd = Math.min(text.length, start + safeChunkSize);
    const end = findChunkBoundary(text, start, idealEnd);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - safeOverlap);
  }

  return chunks;
}

export async function collectProjectMemorySources(
  db: DB,
  projectId: string
): Promise<ProjectMemorySource[]> {
  const [
    project,
    chapters,
    characters,
    worldEntries,
    relationships,
    emotions,
    stateEntries,
    plotBoard,
  ] = await Promise.all([
    getProject(db, projectId),
    listChapters(db, projectId),
    listCharacters(db, projectId),
    listWorldEntriesWithTags(db, projectId),
    listRelationshipsForProject(db, projectId),
    listEmotionsForProject(db, projectId),
    listStoryStateEntries(db, projectId),
    listPlotBoard(db, projectId),
  ]);
  if (!project) return [];
  const storyCalendar = getStoryCalendar(project.settingsJson);

  const charactersById = new Map<string, { name: string }>(
    characters.map((character) => [character.id, { name: character.name }])
  );
  const relationshipsByCharacter = new Map<
    string,
    Array<{ description: string | null; name: string; type: string }>
  >();
  for (const relationship of relationships) {
    const add = (characterId: string, otherCharacterId: string) => {
      const rows = relationshipsByCharacter.get(characterId) ?? [];
      rows.push({
        description: relationship.description,
        name: charactersById.get(otherCharacterId)?.name ?? '알 수 없는 인물',
        type: relationship.relationshipType,
      });
      relationshipsByCharacter.set(characterId, rows);
    };
    add(relationship.characterAId, relationship.characterBId);
    add(relationship.characterBId, relationship.characterAId);
  }
  const emotionsByCharacter = new Map<string, typeof emotions>();
  for (const emotion of emotions) {
    const rows = emotionsByCharacter.get(emotion.characterId) ?? [];
    rows.push(emotion);
    emotionsByCharacter.set(emotion.characterId, rows);
  }

  const sources: ProjectMemorySource[] = [
    {
      content: [
        `작품명: ${project.title}`,
        project.genre && `장르: ${project.genre}`,
        project.synopsis && `시놉시스: ${project.synopsis}`,
        project.settingsJson && `기획 설정: ${project.settingsJson}`,
        project.writingStyleDescription &&
          `문체 규칙: ${project.writingStyleDescription}`,
        project.writingStyleSample &&
          `문체 예문: ${project.writingStyleSample}`,
      ]
        .filter(Boolean)
        .join('\n'),
      id: project.id,
      title: project.title,
      type: 'project',
      updatedAt: project.updatedAt,
    },
  ];

  for (const chapter of chapters) {
    const prose = convertToPlainText(chapter.contentJson);
    sources.push({
      content: [
        `챕터 ${chapter.order + 1}: ${chapter.title}`,
        chapter.storyDatePrecision !== 'none' && `작품 시점: ${formatStoryDate(storyCalendar, chapter)}`,
        chapter.outline && `개요: ${chapter.outline}`,
        chapter.summary && `요약: ${chapter.summary}`,
        chapter.memo && `메모: ${chapter.memo}`,
        prose && `본문:\n${prose}`,
      ]
        .filter(Boolean)
        .join('\n'),
      id: chapter.id,
      title: chapter.title,
      type: 'chapter',
      updatedAt: chapter.updatedAt,
    });
  }

  for (const character of characters) {
    const characterRelationships = relationshipsByCharacter.get(character.id) ?? [];
    const characterEmotions = emotionsByCharacter.get(character.id) ?? [];
    sources.push({
      content: [
        `등장인물: ${character.name}`,
        character.role && `역할: ${character.role}`,
        character.appearance && `외모: ${character.appearance}`,
        character.personality && `성격: ${character.personality}`,
        character.backstory && `배경: ${character.backstory}`,
        character.arcDescription && `인물 변화: ${character.arcDescription}`,
        character.voiceGuide && `말투·목소리 규칙: ${character.voiceGuide}`,
        character.voiceExamplesJson && `말투 근거 예문: ${character.voiceExamplesJson}`,
        character.itemsJson && `소지품: ${character.itemsJson}`,
        characterRelationships.length > 0 &&
          `관계:\n${characterRelationships
            .map(
              (relationship) =>
                `- ${relationship.name}: ${relationship.type}${
                  relationship.description ? ` (${relationship.description})` : ''
                }`
            )
            .join('\n')}`,
        characterEmotions.length > 0 &&
          `감정선:\n${characterEmotions
            .map(
              (emotion) =>
                `- ${emotion.chapterTitle}: ${emotion.emotion}${
                  emotion.note ? ` (${emotion.note})` : ''
                }`
            )
            .join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n'),
      id: character.id,
      title: character.name,
      type: 'character',
      updatedAt: character.updatedAt,
    });
  }

  for (const entry of worldEntries) {
    sources.push({
      content: [
        `세계관 [${entry.category}]: ${entry.title}`,
        splitResearchContent(entry.content).content,
        entry.tags.length > 0 &&
          `태그: ${entry.tags.map((tag) => tag.tag).join(', ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
      id: entry.id,
      title: entry.title,
      type: 'world',
      updatedAt: entry.updatedAt,
    });
  }

  for (const entry of stateEntries) {
    const subject = entry.characterName ?? entry.worldEntryTitle ?? '작품 전체';
    const knowledge = entry.knowledgeScope === 'canon'
      ? '실제 정전 사실'
      : entry.knowledgeScope === 'reader'
        ? `독자 공개 정보 (${entry.certainty === 'known' ? '확정 공개' : entry.certainty === 'suspected' ? '의심 가능' : '그렇게 믿도록 제시'})`
        : `${entry.knowerCharacterName ?? '지정 인물'}의 정보 (${entry.certainty === 'known' ? '알고 있음' : entry.certainty === 'suspected' ? '의심함' : '사실 여부와 무관하게 믿고 있음'})`;
    sources.push({
      content: [
        `지속 상태 메모 [${entry.category}]`,
        `대상: ${subject}`,
        `정보 구분: ${knowledge}`,
        `항목: ${entry.label}`,
        entry.previousValue && `이전 값: ${entry.previousValue}`,
        `현재 값: ${entry.value}`,
        entry.chapterTitle && `반영 시점: ${entry.chapterTitle}부터`,
        entry.endChapterTitle && `종료 시점: ${entry.endChapterTitle}부터 사용 금지`,
        `기록 상태: ${
          entry.isActive
            ? '현재 유효한 정전'
            : '종료된 과거 이력(현재 상태로 사용 금지)'
        }`,
        entry.isPinned ? '중요도: 작가 고정' : '',
        entry.details && `작가 참고: ${entry.details}`,
        entry.evidence && `원고 근거: ${entry.evidence}`,
      ]
        .filter(Boolean)
        .join('\n'),
      id: entry.id,
      title: `${subject} · ${entry.label}`,
      type: 'state',
      updatedAt: entry.updatedAt,
    });
  }

  const plotNodeById = new Map<string, { title: string }>(
    plotBoard.nodes.map(node => [node.id, { title: node.title }])
  );
  for (const node of plotBoard.nodes.filter(node => node.status === 'confirmed')) {
    const incoming = plotBoard.edges.filter(edge => edge.toNodeId === node.id).map(edge =>
      `${plotNodeById.get(edge.fromNodeId)?.title ?? '이전 사건'} → ${PLOT_EDGE_LABELS[edge.type]}`);
    const outgoing = plotBoard.edges.filter(edge => edge.fromNodeId === node.id).map(edge =>
      `${PLOT_EDGE_LABELS[edge.type]} → ${plotNodeById.get(edge.toNodeId)?.title ?? '후속 사건'}`);
    sources.push({
      content: [
        `확정된 복선·인과 노드 [${PLOT_NODE_LABELS[node.kind]}]: ${node.title}`,
        node.chapterTitle && `회차: ${node.chapterTitle}`,
        node.storyDatePrecision !== 'none' && `작품 시점: ${formatStoryDate(storyCalendar, node)}`,
        node.lane && `흐름: ${node.lane}`,
        node.description,
        incoming.length && `선행 연결:\n${incoming.map(value => `- ${value}`).join('\n')}`,
        outgoing.length && `후속 연결:\n${outgoing.map(value => `- ${value}`).join('\n')}`,
        node.evidence && `원고 근거: ${node.evidence}`,
      ].filter(Boolean).join('\n'),
      id: node.id, title: node.title, type: 'plot', updatedAt: node.updatedAt,
    });
  }

  return sources;
}

async function embedInBatches(
  input: string[],
  config: NonNullable<Awaited<ReturnType<typeof resolveEmbeddingServiceConfig>>>,
  signal?: AbortSignal
) {
  const vectors: number[][] = [];
  let model = config.model;
  for (let offset = 0; offset < input.length; offset += EMBEDDING_BATCH_SIZE) {
    const batch = await createEmbeddings(
      config,
      input.slice(offset, offset + EMBEDDING_BATCH_SIZE),
      signal
    );
    model = batch.model;
    vectors.push(...batch.vectors);
  }
  return { model, vectors };
}

export async function indexProjectMemory(
  db: DB,
  projectId: string,
  signal?: AbortSignal
): Promise<ProjectMemoryIndexResult> {
  const sources = await collectProjectMemorySources(db, projectId);
  const config = await resolveEmbeddingServiceConfig(db, projectId);
  const activeKeys = sources.map((source) => `${source.type}:${source.id}`);
  const existingRows = await listSemanticMemoryChunks(db, projectId);
  const existingBySource = new Map<string, typeof existingRows>();
  for (const row of existingRows) {
    const key = `${row.sourceType}:${row.sourceId}`;
    const rows = existingBySource.get(key) ?? [];
    rows.push(row);
    existingBySource.set(key, rows);
  }
  let skippedSources = 0;
  let embeddingError: string | undefined;
  let embeddingModel: string | undefined;
  const prepared = sources.map((source) => {
    if (signal?.aborted) throw signal.reason;
    const chunks = chunkMemoryText(source.content);
    const hashes = chunks.map(hashText);
    const existing = existingBySource.get(`${source.type}:${source.id}`) ?? [];
    existing.sort((left, right) => left.chunkIndex - right.chunkIndex);
    const contentUnchanged =
      existing.length === chunks.length &&
      existing.every((row, index) => row.contentHash === hashes[index]);
    const vectorsCurrent =
      !config ||
      existing.every((row) => {
        const vector = parseVector(row.embeddingJson);
        return (
          vector &&
          row.embeddingModel?.startsWith(
            `${getEmbeddingFingerprintPrefix(config)}:`
          ) && row.embeddingModel.endsWith(`:d${vector.length}`)
        );
      });

    if (contentUnchanged && vectorsCurrent) {
      skippedSources += 1;
    }
    return {
      changed: !(contentUnchanged && vectorsCurrent),
      chunks,
      hashes,
      source,
    };
  });
  const changedSources = prepared.filter((item) => item.changed);
  const changedChunkTexts = changedSources.flatMap((item) => item.chunks);
  let embeddedVectors: number[][] = [];

  if (config && changedChunkTexts.length > 0) {
    try {
      const embedded = await embedInBatches(changedChunkTexts, config, signal);
      embeddedVectors = embedded.vectors;
      embeddingModel = embedded.model;
    } catch (error) {
      embeddingError =
        error instanceof Error
          ? error.message
          : '임베딩 서비스에 연결할 수 없습니다.';
    }
  }

  let vectorOffset = 0;
  const replacements = changedSources.map(({ chunks, hashes, source }) => {
    const sourceVectors = embeddedVectors.slice(
      vectorOffset,
      vectorOffset + chunks.length
    );
    vectorOffset += chunks.length;
    return {
      chunks: chunks.map((content, chunkIndex) => {
        const vector = sourceVectors[chunkIndex];
        return {
          chunkIndex,
          content,
          contentHash: hashes[chunkIndex] ?? hashText(content),
          embeddingJson: vector ? JSON.stringify(vector) : null,
          embeddingModel:
            config && vector && embeddingModel
              ? getEmbeddingFingerprint(config, vector.length, embeddingModel)
              : null,
          projectId,
          sourceId: source.id,
          sourceTitle: source.title,
          sourceType: source.type,
          sourceUpdatedAt: source.updatedAt ?? null,
        };
      }),
      projectId,
      sourceId: source.id,
      sourceType: source.type,
    };
  });
  await replaceSemanticMemorySources(db, replacements);

  const removedSources = await deleteStaleMemorySources(
    db,
    projectId,
    activeKeys
  );
  return {
    chunks: prepared.reduce((count, item) => count + item.chunks.length, 0),
    embeddingAvailable: Boolean(config) && !embeddingError,
    ...(embeddingError ? { embeddingError } : {}),
    ...(embeddingModel ? { embeddingModel } : {}),
    removedSources,
    skippedSources,
    updatedSources: changedSources.length,
  };
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLocaleLowerCase('ko-KR')
        .split(/[^\p{L}\p{N}]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  );
}

function lexicalScore(content: string, query: string) {
  const normalized = content.toLocaleLowerCase('ko-KR');
  const normalizedQuery = query.toLocaleLowerCase('ko-KR').trim();
  let score = normalizedQuery && normalized.includes(normalizedQuery) ? 8 : 0;
  for (const token of tokenize(query)) {
    const occurrences = normalized.split(token).length - 1;
    score += Math.min(4, occurrences);
  }
  return score;
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
    leftNorm += (left[index] ?? 0) ** 2;
    rightNorm += (right[index] ?? 0) ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function parseVector(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export async function retrieveProjectMemory(
  db: DB,
  projectId: string,
  query: string,
  options: { limit?: number; perSourceLimit?: number; signal?: AbortSignal; chapterId?: string } = {}
): Promise<ProjectMemoryRetrievalResult> {
  let rows = await listSemanticMemoryChunks(db, projectId);
  if (options.chapterId) {
    const [chapterRows, stateRows, plotBoard] = await Promise.all([
      listChapters(db, projectId), listStoryStateEntries(db, projectId), listPlotBoard(db, projectId),
    ]);
    const currentOrder = chapterRows.find((chapter) => chapter.id === options.chapterId)?.order;
    if (currentOrder !== undefined) {
      const orderByChapter = new Map(chapterRows.map((chapter) => [chapter.id, chapter.order]));
      const allowedStates = new Set(stateRows.filter((state) => isStoryStateEffectiveAt({
        ...state,
        chapterOrder: state.chapterId ? orderByChapter.get(state.chapterId) ?? null : null,
        endChapterOrder: state.endChapterId ? orderByChapter.get(state.endChapterId) ?? null : null,
      }, currentOrder)).map((state) => state.id));
      const allowedChapters = new Set(chapterRows.filter((chapter) => chapter.order <= currentOrder).map((chapter) => chapter.id));
      const allowedPlot = new Set(plotBoard.nodes.filter(node => node.status === 'confirmed' &&
        (!node.chapterId || (orderByChapter.get(node.chapterId) ?? Number.MAX_SAFE_INTEGER) <= currentOrder)).map(node => node.id));
      rows = rows.filter((row) => row.sourceType === 'chapter' ? allowedChapters.has(row.sourceId)
        : row.sourceType === 'state' ? allowedStates.has(row.sourceId)
          : row.sourceType === 'plot' ? allowedPlot.has(row.sourceId) : true);
    }
  }
  const limit = Math.max(1, Math.min(options.limit ?? 8, 24));
  const config = await resolveEmbeddingServiceConfig(db, projectId);
  let queryVector: number[] | null = null;
  let queryFingerprint: string | null = null;
  let warning: string | undefined;

  if (config && rows.some((row) => row.embeddingJson)) {
    try {
      const embeddedQuery = await createQueryEmbedding(
        config,
        query,
        options.signal
      );
      queryVector = embeddedQuery.vector;
      queryFingerprint = getEmbeddingFingerprint(
        config,
        queryVector.length,
        embeddedQuery.model
      );
    } catch (error) {
      warning = `임베딩 검색을 사용할 수 없어 키워드 검색으로 전환했습니다: ${
        error instanceof Error ? error.message : '연결 실패'
      }`;
    }
  } else if (!config) {
    warning = '임베딩 API가 설정되지 않아 키워드 검색을 사용했습니다.';
  }

  const scored = rows.map((row) => {
    const lexical = lexicalScore(row.content, query);
    const vector =
      queryFingerprint && row.embeddingModel === queryFingerprint
        ? parseVector(row.embeddingJson)
        : null;
    const semantic = queryVector && vector
      ? Math.max(0, cosineSimilarity(queryVector, vector))
      : null;
    return { lexical, row, semantic };
  });
  const maxLexical = Math.max(1, ...scored.map((item) => item.lexical));
  const ranked = scored
    .map(({ lexical, row, semantic }) => ({
      content: row.content,
      lexicalScore: lexical,
      score:
        semantic === null
          ? lexical / maxLexical
          : semantic * 0.72 + (lexical / maxLexical) * 0.28,
      semanticScore: semantic,
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      sourceType: row.sourceType,
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
  const matches: ProjectMemoryMatch[] = [];
  const countsBySource = new Map<string, number>();
  const perSourceLimit = Math.max(1, Math.min(options.perSourceLimit ?? 2, 5));
  for (const match of ranked) {
    const key = `${match.sourceType}:${match.sourceId}`;
    const count = countsBySource.get(key) ?? 0;
    if (count >= perSourceLimit) continue;
    countsBySource.set(key, count + 1);
    matches.push(match);
    if (matches.length >= limit) break;
  }
  const hasCompatibleVectors = matches.some(
    (match) => match.semanticScore !== null
  );
  if (queryVector && !hasCompatibleVectors && !warning) {
    warning = '저장된 벡터의 모델·차원 지문이 현재 임베딩 서비스와 달라 키워드 검색을 사용했습니다.';
  }

  return {
    matches,
    mode: queryVector && hasCompatibleVectors ? 'hybrid' : 'keyword',
    ...(warning ? { warning } : {}),
  };
}

export function formatMemoryContext(matches: ProjectMemoryMatch[], maxChars = 8_000) {
  const sections: string[] = [];
  for (const match of matches) {
    const section = `### ${match.sourceTitle} (${match.sourceType})\n${match.content}`;
    const used = sections.join('\n\n').length;
    const remaining = maxChars - used - (sections.length > 0 ? 2 : 0);
    if (remaining <= 80) break;
    sections.push(section.slice(0, remaining));
  }
  return sections.join('\n\n');
}
