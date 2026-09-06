import fs from 'node:fs';
import path from 'node:path';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;
const REQUIRED_FIELDS = ['id', 'title', 'category', 'tags', 'summary'];

function listMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md'
        ? [entryPath]
        : [];
    })
    .sort();
}

function parseMetadata(raw) {
  const match = raw.match(FRONTMATTER_PATTERN);
  if (!match) return null;

  const metadata = new Map();
  for (const line of (match[1] ?? '').split(/\r?\n/u)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    metadata.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  return { body: raw.slice(match[0].length).trim(), metadata };
}

const knowledgeRoot = path.resolve(
  process.argv[2] || path.join(process.cwd(), 'knowledge', 'writing')
);
const sourceCatalogPath = path.resolve(
  process.cwd(),
  'knowledge',
  'sources',
  'mediawiki-writing.json'
);
const files = listMarkdownFiles(knowledgeRoot);
const seenIds = new Map();
const errors = [];
const warnings = [];
const categories = new Map();
let externalDocuments = 0;
let catalogSources = 0;

for (const filePath of files) {
  const relativePath = path.relative(knowledgeRoot, filePath).replaceAll('\\', '/');
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = parseMetadata(raw);
  if (!parsed) {
    errors.push(`${relativePath}: YAML frontmatter가 없습니다.`);
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!parsed.metadata.get(field)) {
      errors.push(`${relativePath}: 필수 필드 ${field}가 없습니다.`);
    }
  }

  if (!parsed.body) errors.push(`${relativePath}: 본문이 비어 있습니다.`);
  if (parsed.body.length > 12_000) {
    warnings.push(`${relativePath}: 본문이 12,000자를 넘어 검색 청크가 너무 큽니다.`);
  }

  const id = parsed.metadata.get('id');
  if (id) {
    const previous = seenIds.get(id);
    if (previous) errors.push(`${relativePath}: id ${id}가 ${previous}와 중복됩니다.`);
    else seenIds.set(id, relativePath);
  }

  const category = parsed.metadata.get('category') ?? '미분류';
  categories.set(category, (categories.get(category) ?? 0) + 1);

  if (relativePath.startsWith('external/')) {
    externalDocuments += 1;
    for (const field of ['sourceUrl', 'license', 'accessedAt']) {
      if (!parsed.metadata.get(field)) {
        errors.push(`${relativePath}: 외부 문서 필드 ${field}가 없습니다.`);
      }
    }
  }
}

if (fs.existsSync(sourceCatalogPath)) {
  try {
    const catalog = JSON.parse(fs.readFileSync(sourceCatalogPath, 'utf8'));
    const sources = Array.isArray(catalog.sources) ? catalog.sources : [];
    const sourceIds = new Set();
    catalogSources = sources.length;

    for (const [index, source] of sources.entries()) {
      const label = `source catalog #${index + 1}`;
      if (!source || typeof source !== 'object') {
        errors.push(`${label}: 객체 형식이 아닙니다.`);
        continue;
      }
      for (const field of [
        'id',
        'apiBase',
        'page',
        'title',
        'category',
        'license',
        'sourceUrl',
        'summary',
      ]) {
        if (typeof source[field] !== 'string' || !source[field].trim()) {
          errors.push(`${label}: 필수 필드 ${field}가 없습니다.`);
        }
      }
      if (typeof source.id === 'string') {
        if (sourceIds.has(source.id)) {
          errors.push(`${label}: source id ${source.id}가 중복됩니다.`);
        }
        sourceIds.add(source.id);
      }
      for (const field of ['apiBase', 'sourceUrl']) {
        if (
          typeof source[field] === 'string' &&
          !source[field].startsWith('https://')
        ) {
          errors.push(`${label}: ${field}는 HTTPS URL이어야 합니다.`);
        }
      }
    }
  } catch (error) {
    errors.push(
      `source catalog: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const summary = {
  categories: Object.fromEntries([...categories.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))),
  catalogSources,
  documents: files.length,
  errors: errors.length,
  externalDocuments,
  root: knowledgeRoot,
  warnings: warnings.length,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
for (const warning of warnings) process.stderr.write(`[warning] ${warning}\n`);
for (const error of errors) process.stderr.write(`[error] ${error}\n`);

if (errors.length > 0) process.exitCode = 1;
