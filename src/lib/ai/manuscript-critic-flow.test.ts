import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('ai', async (importOriginal) => ({ ...await importOriginal<typeof import('ai')>(), generateText: vi.fn() }));
vi.mock('./build-story-context', () => ({ buildStoryContext: vi.fn(async () => '## 현재 챕터\n개요: 무림인 시점으로 산을 수색한다.') }));
vi.mock('./resolve-project-provider', () => ({ resolveProjectProvider: vi.fn(async () => ({ provider: 'qwen-local', modelId: 'test' })) }));
vi.mock('./provider-factory', () => ({ createProvider: vi.fn(() => ({})) }));
vi.mock('./request-scheduler', () => ({ runAIRequest: vi.fn((_config, options, run) => run(options.signal)) }));
vi.mock('@/lib/db/queries/writing-style-profiles', () => ({ getActiveWritingStyleProfile: vi.fn() }));
vi.mock('@/lib/db/queries/writing-workbench', () => ({ getWritingWorkbenchContext: vi.fn(() => ({ scene: '', examples: '' })) }));
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
});
