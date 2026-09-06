import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  generateText: vi.fn(),
  runAIRequest: vi.fn(),
}));

vi.mock('ai', () => ({ generateText: mocks.generateText }));
vi.mock('./provider-factory', () => ({
  createProvider: mocks.createProvider,
}));
vi.mock('./request-scheduler', () => ({
  runAIRequest: mocks.runAIRequest,
}));

describe('daily slogan scheduling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.createProvider.mockReturnValue('test-model');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('runs as background work and includes queue wait in the 8 second timeout', async () => {
    const requestTimeoutSignal = new AbortController().signal;
    const schedulerSignal = new AbortController().signal;
    const timeoutSpy = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(requestTimeoutSignal);
    mocks.runAIRequest.mockImplementation(
      (
        _config: unknown,
        _options: unknown,
        run: (signal: AbortSignal) => Promise<unknown>
      ) => run(schedulerSignal)
    );
    mocks.generateText.mockResolvedValue({ text: '“오늘의 장면을 한 줄 열어 보세요.”' });

    const { getDailySlogan } = await import('./daily-slogan');
    await expect(getDailySlogan()).resolves.toBe(
      '오늘의 장면을 한 줄 열어 보세요.'
    );

    expect(mocks.runAIRequest).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai' }),
      expect.objectContaining({
        priority: 'background',
        signal: requestTimeoutSignal,
      }),
      expect.any(Function)
    );
    expect(timeoutSpy).toHaveBeenCalledWith(8000);
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: schedulerSignal,
        timeout: 8000,
      })
    );
  });
});
