import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('ai', async (importOriginal) => ({ ...await importOriginal<typeof import('ai')>(), generateText: vi.fn() }));
vi.mock('./build-story-context', () => ({ buildStoryContext: vi.fn(async () => '## 현재 챕터\n개요: 무림인 시점으로 산을 수색한다.') }));
vi.mock('./resolve-project-provider', () => ({ resolveProjectProvider: vi.fn(async () => ({ provider: 'qwen-local', modelId: 'test' })) }));
vi.mock('./provider-factory', () => ({ createProvider: vi.fn(() => ({})) }));
vi.mock('./request-scheduler', () => ({ runAIRequest: vi.fn((_config, options, run) => run(options.signal)) }));
vi.mock('@/lib/db/queries/writing-style-profiles', () => ({ getActiveWritingStyleProfile: vi.fn() }));
vi.mock('@/lib/db/queries/writing-workbench', () => ({ getWritingWorkbenchContext: vi.fn(() => ({ scene: '', examples: '' })) }));
vi.mock('@/lib/db/queries/projects', () => ({ getProject: vi.fn(async () => ({ genre: '무협', writingStyleDescription: '건조한 문체', writingStyleSample: '바람이 불었다.' })) }));
vi.mock('@/lib/knowledge/writing-knowledge', () => ({ runWritingKnowledgeAgent: vi.fn(() => ({ context: '장면 목적과 감정 인과를 함께 본다.' })) }));
import { generateText } from 'ai';
import { analyzeManuscript } from './manuscript-critic';

const prose = '무림인들의 대화가 들려왔다. "정파가 먼저 도착했군." 곽진봉은 그들의 대화를 엿들었다.';
const generated = { summary: '군중의 대화를 통해 정보를 얻는 흐름입니다.', sceneNotes: [], suggestions: [{
  category: 'dialogue', scope: 'sentence', confidence: 0.99,
  original: '정파가 먼저 도착했군.', replacement: '곽진봉은 흉터를 만지며 도착을 알렸다.', reason: '더 생생합니다.',
}] };
const options = { currentProse: prose, db: {} as never, projectId: 'project', review: true, signal: new AbortController().signal };

describe('critic end-to-end quality gate', () => {
  beforeEach(() => vi.clearAllMocks());
  it('does not expose generated edits when comparison fails', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: generated } as never).mockRejectedValueOnce(new Error('comparison unavailable'));
    const report = await analyzeManuscript(options);
    expect(report.suggestions).toEqual([]);
    expect(report.qualityReview?.status).toBe('unavailable');
    expect(report.summary).toBe(generated.summary);
  });
  it('runs contextual comparison instead of laundering candidate explanations through a tone pass', async () => {
    vi.mocked(generateText).mockResolvedValueOnce({ output: generated } as never)
      .mockResolvedValueOnce({ output: { decisions: [{
        id: 'edit-1', preferred: 'A', preservesFacts: true, preservesSpeaker: true,
        fitsSurroundings: true, avoidsNewRepetition: true, reason: '원문의 화자가 유지됩니다.',
      }] } } as never);
    const report = await analyzeManuscript(options);
    expect(report.suggestions).toEqual([]);
    expect(report.qualityReview?.withheld).toBe(1);
    expect(vi.mocked(generateText).mock.calls[1][0].prompt).toContain('그들의 대화를 엿들었다');
    expect(generateText).toHaveBeenCalledTimes(2);
  });
  it('compares every generated edit in bounded batches instead of dropping edits after the fourth', async () => {
    const sentences = Array.from({ length: 5 }, (_, index) => `원문 문장 ${index + 1}은 길게 이어졌다.`);
    const reasons = ['중복 주어를 합쳐 행동을 빠르게 보이게 합니다.', '모호한 화자를 밝혀 대화의 주체를 분명히 합니다.',
      '정보 공개 순서를 조정해 반전의 효과를 보존합니다.', '감정 반응의 원인을 앞선 행동에 연결합니다.', '장면 전환 위치를 나눠 시간의 경과를 명확히 합니다.'];
    const suggestions = sentences.map((original, index) => ({ category: 'rhythm', scope: 'sentence', confidence: 0.9,
      original, replacement: `다듬은 문장 ${index + 1}.`, reason: reasons[index] }));
    const decision = (index: number) => ({ id: `edit-${index + 1}`, preferred: index % 2 === 0 ? 'B' : 'A', preservesFacts: true,
      preservesSpeaker: true, fitsSurroundings: true, avoidsNewRepetition: true, reason: '앞뒤 문맥과 자연스럽게 연결됩니다.' });
    vi.mocked(generateText).mockResolvedValueOnce({ output: { summary: '다섯 구간을 검토합니다.', sceneNotes: [], suggestions } } as never)
      .mockResolvedValueOnce({ output: { decisions: [0, 1, 2, 3].map(decision) } } as never)
      .mockResolvedValueOnce({ output: { decisions: [decision(4)] } } as never);
    const report = await analyzeManuscript({ ...options, currentProse: sentences.join(' ') });
    expect(report.suggestions).toHaveLength(5);
    expect(report.qualityReview).toMatchObject({ status: 'checked', evaluated: 5, withheld: 0 });
    expect(generateText).toHaveBeenCalledTimes(3);
  });
});
