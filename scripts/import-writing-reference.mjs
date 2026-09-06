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

function required(argumentsMap, key) {
  const value = argumentsMap.get(key)?.trim();
  if (!value) throw new Error(`--${key} 값이 필요합니다.`);
  return value;
}

function chunkText(value, maxChars = 6000) {
  const paragraphs = value.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
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

function safeMetadata(value) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

const argumentsMap = parseArguments(process.argv.slice(2));
if (argumentsMap.get('rights-confirmed') !== 'yes') {
  throw new Error('저장 권한을 확인한 자료만 가져올 수 있습니다. --rights-confirmed yes를 지정하세요.');
}

const inputPath = path.resolve(required(argumentsMap, 'input'));
const id = required(argumentsMap, 'id').toLocaleLowerCase().replace(/[^a-z0-9-]+/g, '-');
const title = safeMetadata(required(argumentsMap, 'title'));
const category = safeMetadata(argumentsMap.get('category') || '외부 자료');
const kind = safeMetadata(argumentsMap.get('kind') || 'reference');
const summary = safeMetadata(required(argumentsMap, 'summary'));
const license = safeMetadata(required(argumentsMap, 'license'));
const sourceUrl = safeMetadata(argumentsMap.get('source-url') || 'local-authorized-source');
const tags = (argumentsMap.get('tags') || '')
  .split(',')
  .map((tag) => safeMetadata(tag))
  .filter(Boolean);
const outputRoot = path.resolve(
  argumentsMap.get('output-dir') || path.join(process.cwd(), 'knowledge', 'writing', 'reference', 'imported')
);
const text = fs.readFileSync(inputPath, 'utf8').trim();
if (!text) throw new Error('입력 파일이 비어 있습니다.');

fs.mkdirSync(outputRoot, { recursive: true });
const chunks = chunkText(text);
for (const [index, chunk] of chunks.entries()) {
  const part = String(index + 1).padStart(3, '0');
  const documentId = chunks.length > 1 ? `${id}-part-${part}` : id;
  const documentTitle = chunks.length > 1 ? `${title} (${index + 1}/${chunks.length})` : title;
  const outputPath = path.join(outputRoot, `${documentId}.md`);
  if (fs.existsSync(outputPath)) {
    throw new Error(`이미 존재하는 문서입니다: ${outputPath}`);
  }

  const frontmatter = [
    '---',
    `id: ${documentId}`,
    `title: ${documentTitle}`,
    `category: ${category}`,
    `kind: ${kind}`,
    `tags: [${tags.join(', ')}]`,
    `summary: ${summary}`,
    `sourceUrl: ${sourceUrl}`,
    `license: ${license}`,
    '---',
    '',
  ].join('\n');
  fs.writeFileSync(outputPath, `${frontmatter}${chunk}\n`, 'utf8');
  process.stdout.write(`${outputPath}\n`);
}

process.stdout.write(`가져오기 완료: ${chunks.length}개 문서\n`);
