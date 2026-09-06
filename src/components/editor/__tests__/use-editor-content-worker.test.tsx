import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  EditorContentWorkerRequest,
  EditorContentWorkerResponse,
} from '../editor-content-worker-core';
import { processEditorContent } from '../editor-content-worker-core';
import { useEditorContentWorker } from '../use-editor-content-worker';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<EditorContentWorkerResponse>) => void) | null = null;
  readonly options?: WorkerOptions;
  posted: EditorContentWorkerRequest[] = [];
  terminated = false;
  readonly url: URL;

  constructor(url: URL, options?: WorkerOptions) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }

  postMessage(message: EditorContentWorkerRequest) {
    this.posted.push(message);
  }

  respond(index: number) {
    const request = this.posted[index];
    if (!request) throw new Error('응답할 Worker 요청이 없습니다.');

    this.onmessage?.(
      new MessageEvent('message', {
        data: {
          requestId: request.requestId,
          result: processEditorContent(request.value),
          success: true,
        },
      })
    );
  }

  terminate() {
    this.terminated = true;
  }
}

describe('useEditorContentWorker', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a named module worker and returns processed content', () => {
    const onResult = vi.fn();
    const { result, unmount } = renderHook(() =>
      useEditorContentWorker({ onResult })
    );

    const worker = FakeWorker.instances[0];
    expect(worker?.options).toMatchObject({
      name: 'muse-editor-content',
      type: 'module',
    });
    expect(worker?.url.pathname).toContain('editor-content.worker.ts');

    act(() => {
      result.current.processValue([
        { children: [{ text: '첫 문장' }], type: 'p' },
      ]);
    });

    expect(worker?.posted).toHaveLength(1);

    act(() => worker?.respond(0));

    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        characterCount: 4,
        plainText: '첫 문장',
      }),
      true
    );

    unmount();
    expect(worker?.terminated).toBe(true);
  });

  it('coalesces queued edits while preserving the active snapshot', () => {
    const onResult = vi.fn();
    const { result } = renderHook(() => useEditorContentWorker({ onResult }));
    const worker = FakeWorker.instances[0];

    act(() => {
      result.current.processValue([{ children: [{ text: '1' }], type: 'p' }]);
      result.current.processValue([{ children: [{ text: '2' }], type: 'p' }]);
      result.current.processValue([{ children: [{ text: '3' }], type: 'p' }]);
    });

    expect(worker?.posted).toHaveLength(1);

    act(() => worker?.respond(0));

    expect(worker?.posted).toHaveLength(2);
    expect(worker?.posted[1]?.value).toEqual([
      { children: [{ text: '3' }], type: 'p' },
    ]);

    act(() => worker?.respond(1));

    expect(onResult.mock.calls.map(([processed]) => processed.plainText)).toEqual([
      '1',
      '3',
    ]);
  });

  it('resolves flush only after active and latest pending jobs finish', async () => {
    const { result } = renderHook(() =>
      useEditorContentWorker({ onResult: vi.fn() })
    );
    const worker = FakeWorker.instances[0];
    let flushed = false;

    act(() => {
      result.current.processValue([{ children: [{ text: '1' }], type: 'p' }]);
      result.current.processValue([{ children: [{ text: '2' }], type: 'p' }]);
      void result.current.flush().then(() => {
        flushed = true;
      });
    });

    expect(flushed).toBe(false);

    act(() => worker?.respond(0));
    await Promise.resolve();
    expect(flushed).toBe(false);

    act(() => worker?.respond(1));
    await vi.waitFor(() => expect(flushed).toBe(true));
  });
});
