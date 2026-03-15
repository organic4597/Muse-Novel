import { generateText } from 'ai';
import { getEnvProviderConfig } from '@/lib/ai/daily-slogan';
import { decryptApiKey } from '@/lib/ai/encryption';
import { resolveStoredProviderConfig } from '@/lib/ai/provider-config-resolver';
import { createProvider } from '@/lib/ai/provider-factory';
import { getProviderOptions } from '@/lib/ai/provider-options';
import { getQloraBaseModel } from '@/lib/ai/qlora-runtime';
import { ensureServerForInference } from '@/lib/ai/qwen-server-manager';
import type { ProviderConfig } from '@/lib/ai/types';
import { db } from '@/lib/db';
import { getDefaultProvider } from '@/lib/db/queries/ai-settings';
import { listCharacters } from '@/lib/db/queries/characters';
import { getLora } from '@/lib/db/queries/loras';
import { getProject } from '@/lib/db/queries/projects';
import { listWorldEntries } from '@/lib/db/queries/world-entries';

const CHARACTER_ROLE_OPTIONS = ['주인공', '조연', '악역', '조력자', '기타'] as const;
const WORLD_CATEGORY_OPTIONS = ['장소', '마법', '종족', '문화', '역사', '기술', '사건'] as const;

export type CharacterSuggestion = {
  name?: string;
  role?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  arcDescription?: string;
};

export type WorldEntrySuggestion = {
  title?: string;
  category?: string;
  content?: string;
  tags?: string[];
};

type SuggestionContext = {
  projectId: string;
  description: string;
};

function extractJsonObject(text: string): string | null {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return text.slice(start, end + 1).trim();
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => cleanString(item))
    .filter((item): item is string => Boolean(item));

  const uniqueItems = [...new Set(items)];
  return uniqueItems.length > 0 ? uniqueItems : undefined;
}

async function resolveSuggestionProvider(projectId: string): Promise<ProviderConfig> {
  const project = await getProject(db, projectId);
  if (!project) {
    throw new Error('프로젝트를 찾을 수 없습니다.');
  }

  const providerSettings = await getDefaultProvider(db, projectId);
  let providerConfig: ProviderConfig | null = null;

  if (providerSettings) {
    providerConfig = resolveStoredProviderConfig(providerSettings, {
      decryptApiKey,
    });
  } else {
    providerConfig = getEnvProviderConfig();
  }

  if (!providerConfig) {
    throw new Error('AI 제공자 설정이 없습니다.');
  }

  const activeLora = project.activeLoraId
    ? await getLora(db, project.activeLoraId)
    : undefined;

  if (activeLora && providerConfig.provider !== 'qwen-local') {
    providerConfig = {
      provider: 'qwen-local',
      modelId: getQloraBaseModel(),
      baseUrl: process.env.QWEN_LOCAL_URL ?? 'http://localhost:8321',
    };
  }

  if (providerConfig.provider === 'qwen-local') {
    const loraDir = activeLora
      ? activeLora.filePath.replace(/\/[^/]+$/, '')
      : undefined;

    const serverResult = await ensureServerForInference({
      baseUrl: providerConfig.baseUrl,
      loraPath: loraDir,
      modelId: providerConfig.modelId,
    });

    if (!serverResult.ok) {
      const fallback = getEnvProviderConfig();
      if (!activeLora && fallback && fallback.provider !== 'qwen-local') {
        return fallback;
      }

      throw new Error(serverResult.message);
    }
  }

  return providerConfig;
}

async function generateSuggestionJson(
  projectId: string,
  system: string,
  prompt: string
): Promise<unknown> {
  const providerConfig = await resolveSuggestionProvider(projectId);
  const model = createProvider(providerConfig);

  const result = await generateText({
    model,
    system,
    prompt,
    providerOptions: getProviderOptions(providerConfig),
    maxOutputTokens: 500,
    temperature: 0.35,
  });

  const jsonText = extractJsonObject(result.text);
  if (!jsonText) {
    throw new Error('제안 결과를 해석할 수 없습니다.');
  }

  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error('제안 결과 JSON 파싱에 실패했습니다.');
  }
}

export async function generateCharacterSuggestion({
  projectId,
  description,
}: SuggestionContext): Promise<CharacterSuggestion> {
  const project = await getProject(db, projectId);
  if (!project) {
    throw new Error('프로젝트를 찾을 수 없습니다.');
  }

  const characters = await listCharacters(db, projectId);
  const existingNames = characters.map((character) => character.name).slice(0, 20);

  const system = [
    '당신은 한국어 소설 기획 어시스턴트다.',
    '사용자의 짧은 설명을 바탕으로 캐릭터 기획안을 구조화한다.',
    '반드시 JSON만 출력하라.',
    '설명 문장, 코드블록, 마크다운을 포함하지 마라.',
    `role 값은 다음 중 하나만 사용하라: ${CHARACTER_ROLE_OPTIONS.join(', ')}.`,
    '모든 필드는 선택 사항이지만, 확신이 없으면 추측을 줄이고 비워둘 수 있다.',
  ].join(' ');

  const prompt = [
    `프로젝트 제목: ${project.title}`,
    `장르: ${project.genre ?? '미정'}`,
    `줄거리: ${project.plot ?? '미정'}`,
    existingNames.length > 0
      ? `기존 캐릭터 이름: ${existingNames.join(', ')}`
      : '기존 캐릭터 이름: 없음',
    '다음 설명을 바탕으로 새 캐릭터 제안을 만들어라.',
    `설명: ${description}`,
    '반환 JSON 스키마:',
    '{',
    '  "name": string,',
    '  "role": string,',
    '  "appearance": string,',
    '  "personality": string,',
    '  "backstory": string,',
    '  "arcDescription": string',
    '}',
  ].join('\n');

  const parsed = await generateSuggestionJson(projectId, system, prompt) as Record<string, unknown>;

  const role = cleanString(parsed.role);

  return {
    name: cleanString(parsed.name),
    role: role && CHARACTER_ROLE_OPTIONS.includes(role as (typeof CHARACTER_ROLE_OPTIONS)[number])
      ? role
      : undefined,
    appearance: cleanString(parsed.appearance),
    personality: cleanString(parsed.personality),
    backstory: cleanString(parsed.backstory),
    arcDescription: cleanString(parsed.arcDescription),
  };
}

export async function generateWorldEntrySuggestion({
  projectId,
  description,
}: SuggestionContext): Promise<WorldEntrySuggestion> {
  const project = await getProject(db, projectId);
  if (!project) {
    throw new Error('프로젝트를 찾을 수 없습니다.');
  }

  const entries = await listWorldEntries(db, projectId);
  const existingEntries = entries
    .slice(0, 20)
    .map((entry) => `[${entry.category}] ${entry.title}`);

  const system = [
    '당신은 한국어 소설 세계관 기획 어시스턴트다.',
    '사용자의 짧은 설명을 바탕으로 세계관 항목 초안을 구조화한다.',
    '반드시 JSON만 출력하라.',
    '설명 문장, 코드블록, 마크다운을 포함하지 마라.',
    `category 값은 가능하면 다음 중 하나를 우선 사용하라: ${WORLD_CATEGORY_OPTIONS.join(', ')}.`,
    'tags는 짧은 한국어 명사 배열로 1~5개 이내로 제안하라.',
  ].join(' ');

  const prompt = [
    `프로젝트 제목: ${project.title}`,
    `장르: ${project.genre ?? '미정'}`,
    `줄거리: ${project.plot ?? '미정'}`,
    existingEntries.length > 0
      ? `기존 세계관 항목: ${existingEntries.join(', ')}`
      : '기존 세계관 항목: 없음',
    '다음 설명을 바탕으로 새 세계관 항목 제안을 만들어라.',
    `설명: ${description}`,
    '반환 JSON 스키마:',
    '{',
    '  "title": string,',
    '  "category": string,',
    '  "content": string,',
    '  "tags": string[]',
    '}',
  ].join('\n');

  const parsed = await generateSuggestionJson(projectId, system, prompt) as Record<string, unknown>;

  return {
    title: cleanString(parsed.title),
    category: cleanString(parsed.category),
    content: cleanString(parsed.content),
    tags: cleanStringArray(parsed.tags),
  };
}