import fs from 'node:fs';
import path from 'node:path';

function parseArguments(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith('--')) continue;
    result.set(key.slice(2), values[index + 1] ?? '');
    index += 1;
  }
  return result;
}

function chunkText(value, maxChars = 6000) {
  const paragraphs = value
    .split(/\r?\n\s*\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current);
      current = '';
    }
    if (paragraph.length > maxChars) {
      if (current) chunks.push(current);
      for (let offset = 0; offset < paragraph.length; offset += maxChars) {
        chunks.push(paragraph.slice(offset, offset + maxChars));
      }
      continue;
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

function metadataLine(key, value) {
  if (value === undefined || value === null || value === '') return '';
  const normalized = Array.isArray(value)
    ? `[${value.map((item) => String(item).replace(/[\r\n,]+/g, ' ').trim()).join(', ')}]`
    : String(value).replace(/[\r\n]+/g, ' ').trim();
  return `${key}: ${normalized}`;
}

function resolveKnowledgeKind(source) {
  if (source.category === '글쓰기 교재' || source.category === '문학 배경') {
    return 'craft';
  }
  if (source.category === '장르 자료') return 'genre';
  if (source.category === '분야 원문') return 'domain';
  return source.kind ?? 'reference';
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchMediaWikiExtract(source) {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    prop: 'extracts',
    explaintext: '1',
    redirects: '1',
    titles: source.page,
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${source.apiBase}?${query}`, {
      headers: {
        'user-agent': 'MuseNovelKnowledgeSync/1.0 (local writing knowledge tool)',
      },
    });
    if (response.ok) {
      const payload = await response.json();
      const page = payload?.query?.pages?.[0];
      if (!page || page.missing || typeof page.extract !== 'string') return null;
      const extract = page.extract.trim();
      return extract.length >= 200 ? extract : null;
    }

    if (response.status !== 429 && response.status !== 503) {
      throw new Error(`HTTP ${response.status}`);
    }
    const retryAfterSeconds = Number(response.headers.get('retry-after') ?? 0);
    const backoff = Math.min(
      30_000,
      Math.max(retryAfterSeconds * 1000, 1000 * 2 ** attempt)
    );
    process.stderr.write(
      `[wait] ${source.id}: HTTP ${response.status}, ${backoff}ms 후 재시도\n`
    );
    await delay(backoff);
  }

  throw new Error('재시도 한도를 초과했습니다.');
}

function assertSafeId(value) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
    throw new Error(`안전하지 않은 source id: ${value}`);
  }
}

function writeSourceDocuments(outputRoot, source, text, accessedAt) {
  assertSafeId(source.id);
  const resolvedRoot = path.resolve(outputRoot);
  const sourceDirectory = path.resolve(resolvedRoot, source.id);
  if (!sourceDirectory.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`출력 경로가 지식 디렉터리를 벗어났습니다: ${sourceDirectory}`);
  }

  fs.rmSync(sourceDirectory, { recursive: true, force: true });
  fs.mkdirSync(sourceDirectory, { recursive: true });
  const chunks = chunkText(text);
  chunks.forEach((chunk, index) => {
    const part = String(index + 1).padStart(3, '0');
    const id = `${source.id}-part-${part}`;
    const title = chunks.length > 1
      ? `${source.title} (${index + 1}/${chunks.length})`
      : source.title;
    const attribution = [
      '',
      '---',
      `출처: ${source.sourceUrl}`,
      `라이선스: ${source.license}`,
      `가져온 날짜: ${accessedAt}`,
      '원문 기여자와 변경 이력은 출처 페이지의 역사 탭에서 확인할 수 있습니다.',
    ].join('\n');
    const metadata = [
      '---',
      metadataLine('id', id),
      metadataLine('title', title),
      metadataLine('category', source.category),
      metadataLine('kind', resolveKnowledgeKind(source)),
      metadataLine('genres', source.genres ?? []),
      metadataLine('domains', source.domains ?? []),
      metadataLine('expertise', source.expertise),
      metadataLine('tags', source.tags ?? []),
      metadataLine('summary', source.summary),
      metadataLine('sourceUrl', source.sourceUrl),
      metadataLine('license', source.license),
      metadataLine('accessedAt', accessedAt),
      '---',
    ].filter(Boolean).join('\n');
    fs.writeFileSync(
      path.join(sourceDirectory, `${id}.md`),
      `${metadata}\n\n${chunk}${attribution}\n`,
      'utf8'
    );
  });
  return chunks.length;
}

const argumentsMap = parseArguments(process.argv.slice(2));
const catalogPath = path.resolve(
  argumentsMap.get('catalog') || path.join(process.cwd(), 'knowledge', 'sources', 'mediawiki-writing.json')
);
const outputRoot = path.resolve(
  argumentsMap.get('output-dir') || path.join(process.cwd(), 'knowledge', 'writing', 'external')
);
const requestedIds = new Set(
  (argumentsMap.get('source') || '').split(',').map((value) => value.trim()).filter(Boolean)
);
const requestedLimit = Number(argumentsMap.get('limit') || Number.POSITIVE_INFINITY);
const requestDelayMs = Math.max(
  0,
  Math.min(10_000, Number(argumentsMap.get('delay-ms') || 500))
);
const dryRun = argumentsMap.get('dry-run') === 'yes';
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const sources = catalog.sources
  .filter((source) => requestedIds.size === 0 || requestedIds.has(source.id))
  .slice(0, Number.isFinite(requestedLimit) ? Math.max(0, requestedLimit) : undefined);
const accessedAt = new Date().toISOString().slice(0, 10);
let importedSources = 0;
let importedDocuments = 0;
let skippedSources = 0;

for (const source of sources) {
  assertSafeId(source.id);
  if (dryRun) {
    process.stdout.write(`[dry-run] ${source.id}: ${source.page}\n`);
    continue;
  }

  try {
    const text = await fetchMediaWikiExtract(source);
    if (!text) {
      skippedSources += 1;
      process.stderr.write(`[skip] ${source.id}: 문서가 없거나 너무 짧습니다.\n`);
      continue;
    }
    const count = writeSourceDocuments(outputRoot, source, text, accessedAt);
    importedSources += 1;
    importedDocuments += count;
    process.stdout.write(`[ok] ${source.id}: ${count}개 문서\n`);
  } catch (error) {
    skippedSources += 1;
    process.stderr.write(`[skip] ${source.id}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  if (requestDelayMs > 0) await delay(requestDelayMs);
}

process.stdout.write(
  JSON.stringify({ importedDocuments, importedSources, skippedSources, totalSources: sources.length }) + '\n'
);
