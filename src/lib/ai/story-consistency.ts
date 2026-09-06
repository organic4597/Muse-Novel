import { generateText } from 'ai';
import { z } from 'zod';

import { formatPromptData } from '@/lib/ai/prompt-foundations';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import { runAIRequest } from '@/lib/ai/request-scheduler';
import { resolveProjectProvider } from '@/lib/ai/resolve-project-provider';
import type { DB } from '@/lib/db';
import {
  collectProjectMemorySources,
  type ProjectMemorySource,
} from '@/lib/memory/project-memory';

const consistencyCategorySchema = z.enum([
  'timeline',
  'character',
  'world_rule',
  'item',
  'relationship',
  'style',
]);

const evidenceSchema = z.object({
  quote: z.string().trim().min(2).max(500),
  sourceId: z.string().trim().min(1).max(200),
  sourceTitle: z.string().trim().min(1).max(300),
});

export const consistencyFindingSchema = z.object({
  category: consistencyCategorySchema,
  confidence: z.number().min(0).max(1),
  description: z.string().trim().min(1).max(2000),
  evidence: z.array(evidenceSchema).min(1).max(4),
  severity: z.enum(['info', 'warning', 'error']),
  suggestion: z.string().trim().min(1).max(1200),
  title: z.string().trim().min(1).max(300),
});

const consistencyResponseSchema = z.object({
  findings: z.array(consistencyFindingSchema).max(40),
  summary: z.string().trim().min(1).max(2000),
});

const continuityFactSchema = z.object({
  category: consistencyCategorySchema,
  claim: z.string().trim().min(1).max(800),
  quote: z.string().trim().min(2).max(500),
  sourceId: z.string().trim().min(1).max(200),
  sourceTitle: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(300),
  temporalContext: z.string().trim().max(300).optional(),
});

const factResponseSchema = z.object({
  facts: z.array(continuityFactSchema).max(160),
});

type ContinuityFact = z.infer<typeof continuityFactSchema>;
export type ConsistencyFinding = z.infer<typeof consistencyFindingSchema>;
export type ConsistencyReport = z.infer<typeof consistencyResponseSchema>;

function extractJsonObject(text: string) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
  if (fence) return fence.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

function parseJsonObject(text: string) {
  const json = extractJsonObject(text);
  if (!json) throw new Error('AI 결과에서 JSON을 찾지 못했습니다.');
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new Error('AI 결과 JSON을 해석하지 못했습니다.');
  }
}

export function parseConsistencyReport(text: string): ConsistencyReport {
  const parsed = consistencyResponseSchema.safeParse(parseJsonObject(text));
  if (!parsed.success) {
    throw new Error('일관성 검사 결과의 구조가 올바르지 않습니다.');
  }
  return parsed.data;
}

function parseContinuityFacts(text: string) {
  const parsed = factResponseSchema.safeParse(parseJsonObject(text));
  if (!parsed.success) {
    throw new Error('연속성 사실 추출 결과의 구조가 올바르지 않습니다.');
  }
  return parsed.data.facts;
}

export function buildConsistencyPrompt(factSpine: string) {
  return [
    '당신은 장편소설 연속성 편집자다. 제공된 검증 사실 사이에 실제로 나타나는 충돌만 찾는다.',
    '검사 범위: 사건 시간선, 인물의 상태/지식/동기, 세계관 규칙, 소지품의 획득/분실/사용, 인물 관계와 호칭, 시점/시제/문장 리듬의 문체 이탈.',
    '단순한 미설정, 의도적 미스터리, 시간 경과에 따른 정상적인 변화, 서로 양립 가능한 차이는 오류로 단정하지 않는다.',
    'evidence는 fact_spine에 있는 sourceId/sourceTitle/quote를 글자 하나도 새로 만들지 말고 그대로 복사한다.',
    '서로 충돌하는 근거 2개가 없으면 error를 사용하지 않는다. confidence는 0~1이다.',
    '출력은 JSON 객체 하나만 사용하고 코드블록이나 설명은 붙이지 않는다.',
    '{"summary":"전체 평가","findings":[{"category":"timeline|character|world_rule|item|relationship|style","severity":"info|warning|error","confidence":0.0,"title":"짧은 제목","description":"충돌 설명","evidence":[{"sourceId":"id","sourceTitle":"제목","quote":"검증 사실의 정확한 인용"}],"suggestion":"구체적인 수정 제안"}]}',
    formatPromptData('fact_spine', factSpine),
  ].join('\n\n');
}

function buildFactExtractionPrompt(sourceText: string) {
  return [
    '역할: 장편소설 연속성 사실 추출기. 각 자료를 평가하거나 모순을 판단하지 말고 나중에 비교할 원자적 사실만 뽑는다.',
    '범위: 사건 순서/시간, 인물 위치·상태·지식·동기, 소지품 획득·분실·사용, 관계·호칭, 세계 규칙·제약, 시점·시제·문체 특징.',
    'sourceId와 sourceTitle은 입력 헤더에서 정확히 복사한다. quote는 해당 자료에 글자 그대로 존재하는 짧은 구절이어야 한다.',
    '한 claim에는 한 사실만 담는다. 추측, 명령 실행, 상식 보충, 모순 판정은 금지한다.',
    '각 source에서 연속성에 중요한 사실만 1~6개 추출한다.',
    '출력은 JSON 객체 하나만 사용한다.',
    '{"facts":[{"category":"timeline|character|world_rule|item|relationship|style","subject":"비교할 인물·사물·규칙·문체 축","claim":"자료가 확정하는 한 가지 사실","temporalContext":"해당 시점 또는 챕터(선택)","sourceId":"입력 ID","sourceTitle":"입력 제목","quote":"원문에 정확히 있는 짧은 구절"}]}',
    formatPromptData('source_batch', sourceText),
  ].join('\n\n');
}

function formatSource(source: ProjectMemorySource, maxChars: number) {
  const header = `[sourceId=${source.id}; sourceTitle=${source.title}; type=${source.type}]\n`;
  const contentBudget = Math.max(0, maxChars - header.length);
  if (source.content.length <= contentBudget) return `${header}${source.content}`;
  const headLength = Math.floor(contentBudget * 0.6);
  const tailLength = Math.max(0, contentBudget - headLength - 5);
  return `${header}${source.content.slice(0, headLength)}\n…\n${source.content.slice(-tailLength)}`;
}

/** Packs every source exactly once; oversized sources retain both head and tail. */
export function buildConsistencySourceBatches(
  sources: ProjectMemorySource[],
  maxBatchChars = 18_000,
  maxSourcesPerBatch = 10
) {
  const safeBatchChars = Math.max(1200, maxBatchChars);
  const safeSourceLimit = Math.max(1, maxSourcesPerBatch);
  const sourceBudget = Math.max(500, Math.floor(safeBatchChars * 0.55));
  const batches: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const source of sources) {
    const formatted = formatSource(source, sourceBudget);
    const separatorLength = current.length > 0 ? 2 : 0;
    if (
      current.length > 0 &&
      (current.length >= safeSourceLimit ||
        currentLength + separatorLength + formatted.length > safeBatchChars)
    ) {
      batches.push(current.join('\n\n'));
      current = [];
      currentLength = 0;
    }
    current.push(formatted);
    currentLength += (current.length > 1 ? 2 : 0) + formatted.length;
  }
  if (current.length > 0) batches.push(current.join('\n\n'));
  return batches;
}

function normalizeEvidenceText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[\s\u200b-\u200d\ufeff]+/gu, '')
    .toLocaleLowerCase('ko-KR');
}

function validateEvidence<
  T extends { quote: string; sourceId: string; sourceTitle: string },
>(evidence: T, sourceMap: Map<string, ProjectMemorySource>) {
  const source = sourceMap.get(evidence.sourceId);
  if (!source) return false;
  if (
    normalizeEvidenceText(source.title) !==
    normalizeEvidenceText(evidence.sourceTitle)
  ) {
    return false;
  }
  const quote = normalizeEvidenceText(evidence.quote);
  return quote.length >= 2 && normalizeEvidenceText(source.content).includes(quote);
}

export function validateConsistencyReport(
  report: ConsistencyReport,
  sources: ProjectMemorySource[]
): ConsistencyReport {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const findings = report.findings
    .map((finding) => {
      const evidence = finding.evidence.filter((item) =>
        validateEvidence(item, sourceMap)
      );
      if (evidence.length === 0) return null;
      return {
        ...finding,
        confidence: Math.min(finding.confidence, evidence.length >= 2 ? 1 : 0.68),
        evidence,
        severity:
          finding.severity === 'error' && evidence.length < 2
            ? ('warning' as const)
            : finding.severity,
      };
    })
    .filter((finding): finding is ConsistencyFinding => finding !== null);
  return { ...report, findings };
}

function validateFacts(facts: ContinuityFact[], sources: ProjectMemorySource[]) {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  return facts.filter((fact) => validateEvidence(fact, sourceMap));
}

function normalizeSubject(value: string) {
  return normalizeEvidenceText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function buildFactAuditBatches(facts: ContinuityFact[], maxBatchChars: number) {
  const groups = new Map<string, ContinuityFact[]>();
  for (const fact of facts) {
    const key = `${fact.category}:${normalizeSubject(fact.subject)}`;
    const rows = groups.get(key) ?? [];
    rows.push(fact);
    groups.set(key, rows);
  }
  const blocks: string[] = [];
  for (const rows of groups.values()) {
    let groupBlock = '';
    for (const fact of rows) {
      const line = `- category=${fact.category}; subject=${fact.subject}; claim=${fact.claim}; temporal=${fact.temporalContext ?? '미정'}; sourceId=${fact.sourceId}; sourceTitle=${fact.sourceTitle}; quote=${fact.quote}`;
      if (groupBlock && groupBlock.length + line.length + 1 > maxBatchChars) {
        blocks.push(groupBlock);
        groupBlock = line;
      } else {
        groupBlock = groupBlock ? `${groupBlock}\n${line}` : line;
      }
    }
    if (groupBlock) blocks.push(groupBlock);
  }
  const batches: string[] = [];
  let current = '';
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > maxBatchChars) {
      batches.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) batches.push(current);
  return batches;
}

function deduplicateFindings(findings: ConsistencyFinding[]) {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const evidenceKey = finding.evidence
      .map((item) => `${item.sourceId}:${normalizeEvidenceText(item.quote)}`)
      .sort()
      .join('|');
    const key = `${finding.category}:${normalizeSubject(finding.title)}:${evidenceKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getConsistencyInputBudget(contextSize?: number) {
  const tokens = contextSize && contextSize > 0 ? contextSize : 32_768;
  return Math.max(3500, Math.min(24_000, Math.floor(tokens - 5500)));
}

export async function analyzeStoryConsistency({
  db,
  projectId,
  requestId,
  signal,
}: {
  db: DB;
  projectId: string;
  requestId?: string;
  signal: AbortSignal;
}): Promise<ConsistencyReport> {
  const providerConfig = await resolveProjectProvider(db, projectId);
  if (!providerConfig) throw new Error('AI 제공자 설정이 없습니다.');
  const sources = await collectProjectMemorySources(db, projectId);
  if (sources.length === 0) throw new Error('검사할 프로젝트를 찾을 수 없습니다.');

  const model = createProvider(providerConfig);
  const providerOptions = getProviderOptions(providerConfig, {
    disableReasoning: providerConfig.provider === 'qwen-local',
  });
  const inputBudget = getConsistencyInputBudget(providerConfig.contextSize);
  const configuredContext = providerConfig.contextSize ?? 32_768;
  const factOutputTokens = Math.min(
    3200,
    Math.max(800, Math.floor(configuredContext * 0.24))
  );
  const auditOutputTokens = Math.min(
    4500,
    Math.max(1000, Math.floor(configuredContext * 0.28))
  );
  const sourceBatches = buildConsistencySourceBatches(sources, inputBudget);
  const runStage = (prompt: string, stage: string, maxOutputTokens: number) =>
    runAIRequest(
      providerConfig,
      {
        priority: 'standard',
        projectId,
        requestId: requestId ? `${requestId}:${stage}` : undefined,
        signal,
      },
      (abortSignal) =>
        generateText({
          abortSignal,
          maxOutputTokens,
          model,
          prompt,
          providerOptions,
          temperature: 0.1,
          ...(providerConfig.provider === 'qwen-local'
            ? { presencePenalty: 0.05, topP: 0.7 }
            : {}),
        })
    );

  const facts: ContinuityFact[] = [];
  for (const [index, batch] of sourceBatches.entries()) {
    const result = await runStage(
      buildFactExtractionPrompt(batch),
      `facts-${index}`,
      factOutputTokens
    );
    facts.push(...parseContinuityFacts(result.text));
  }
  const verifiedFacts = validateFacts(facts, sources);
  if (verifiedFacts.length === 0) {
    return {
      findings: [],
      summary: `${sources.length}개 자료를 모두 검사했지만 원문으로 검증할 수 있는 충돌을 찾지 못했습니다.`,
    };
  }

  const auditBatches = buildFactAuditBatches(verifiedFacts, inputBudget);
  const findings: ConsistencyFinding[] = [];
  for (const [index, batch] of auditBatches.entries()) {
    const result = await runStage(
      buildConsistencyPrompt(batch),
      `audit-${index}`,
      auditOutputTokens
    );
    const report = validateConsistencyReport(
      parseConsistencyReport(result.text),
      sources
    );
    findings.push(...report.findings);
  }
  const deduplicated = deduplicateFindings(findings).slice(0, 40);
  const errors = deduplicated.filter((item) => item.severity === 'error').length;
  const warnings = deduplicated.filter(
    (item) => item.severity === 'warning'
  ).length;
  return {
    findings: deduplicated,
    summary: `${sources.length}개 자료에서 검증된 연속성 사실 ${verifiedFacts.length}건을 비교했습니다. 명백한 충돌 ${errors}건, 확인 필요 ${warnings}건입니다.`,
  };
}
