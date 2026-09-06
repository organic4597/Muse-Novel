import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoSave } from '@/hooks/use-auto-save';
import {
  clearDraftOutboxIfMatching,
  draftOutboxId,
  putDraftOutbox,
  readDraftOutbox,
} from '@/lib/client/draft-outbox';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('indexedDB', undefined);
    mockFetch.mockReset();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    expect(result.current.status).toBe('idle');
  });

  it('status transitions to saving after debounce delay (5000ms)', async () => {
    // Use a promise we can control to capture the 'saving' state
    let resolveRequest!: (value: unknown) => void;
    const pendingRequest = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    mockFetch.mockReturnValue(pendingRequest);

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content here');
    });

    // Status should still be idle before debounce fires
    expect(result.current.status).toBe('idle');

    // Advance time to trigger debounce (5000ms)
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Now saving should be in progress (fetch hasn't resolved yet)
    expect(result.current.status).toBe('saving');

    // Clean up: resolve the pending request
    await act(async () => {
      resolveRequest({ ok: true, json: async () => ({}) });
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('status transitions to saved after successful PUT request', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('hello world');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    // Wait for fetch promise to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe('saved');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentJson: 'hello world' }),
      })
    );
  });

  it('status transitions to error on fetch failure (non-ok response)', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('unsaved content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
  });

  it('status transitions to error on fetch exception', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');
  });

  it('stores content in localStorage on save failure', async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('backup content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'backup content'
    );
  });

  it('persists locally before server sync and clears the matching backup after success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'content'
    );
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1'
    );
  });

  it('multiple rapid calls only trigger one save (debounce)', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content 1');
      result.current.save('content 2');
      result.current.save('content 3');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Only one fetch call
    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Should save the last value
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'content 3' }),
      })
    );
  });

  it('coalesces rapid local outbox writes and persists only the latest content', async () => {
    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content 1');
      result.current.save('content 2');
      result.current.save('content 3');
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(249);
      await Promise.resolve();
    });
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
    expect(localStorageMock.setItem).toHaveBeenLastCalledWith(
      'muse-novel-backup-chap-1',
      'content 3'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('serializes an in-flight save and keeps only the newest pending content', async () => {
    let resolveFirst!: (value: { ok: boolean }) => void;
    mockFetch
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('older content');
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    act(() => {
      result.current.save('newest content');
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst({ ok: true });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenLastCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'newest content' }),
      })
    );
  });

  it('retry() resubmits the latest content after a failure', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('retry content');
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('error');

    await act(async () => {
      result.current.retry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('resets status to idle 3 seconds after saved', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe('saved');

    // Advance 3 more seconds
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.status).toBe('idle');
  });

  it('persists and syncs the latest pending save immediately on unmount', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result, unmount } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('flush content');
    });

    // Unmount before either the 250ms local write or 5000ms server sync.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    // fetch should have been called (flush triggered)
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'flush content'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'flush content' }),
      })
    );
  });

  it('flush() immediately persists and syncs the latest draft without a later duplicate', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content to flush');
    });

    // Neither the local nor server timer has fired yet.
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    // Call flush manually
    await act(async () => {
      result.current.flush();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'content to flush'
    );

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('flushes the outgoing chapter before chapter options change', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { result, rerender } = renderHook(
      ({ chapterId }) => useAutoSave({ projectId: 'proj-1', chapterId }),
      { initialProps: { chapterId: 'chap-1' } }
    );

    act(() => {
      result.current.save('last content in chapter one');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      rerender({ chapterId: 'chap-2' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'last content in chapter one'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'last content in chapter one' }),
      })
    );
  });

  it('leaves a recovery copy and starts a keepalive sync on pagehide', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('pagehide content');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('pagehide'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'pagehide content'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({ keepalive: true })
    );
  });

  it('persists and syncs pending content when the document becomes hidden', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('hidden content');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'hidden content'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'hidden content' }),
      })
    );
  });

  it('flushes pending content immediately when the browser comes online', async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('online content');
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'online content'
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'online content' }),
      })
    );
  });

  it('does nothing when enabled is false', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1', enabled: false })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('keeps one latest IndexedDB outbox record and only clears a matching save', async () => {
    const { factory, records } = createMemoryIndexedDb();
    vi.stubGlobal('indexedDB', factory);

    const first = {
      id: draftOutboxId('proj-idb', 'chap-idb'),
      projectId: 'proj-idb',
      chapterId: 'chap-idb',
      content: 'first',
      updatedAt: 1,
    };
    const latest = { ...first, content: 'latest', updatedAt: 2 };

    await expect(putDraftOutbox(first)).resolves.toBe('indexeddb');
    await expect(putDraftOutbox(latest)).resolves.toBe('indexeddb');
    await expect(readDraftOutbox('proj-idb', 'chap-idb')).resolves.toEqual(
      latest
    );
    expect(records).toHaveLength(1);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();

    await clearDraftOutboxIfMatching('proj-idb', 'chap-idb', 'first');
    await expect(readDraftOutbox('proj-idb', 'chap-idb')).resolves.toEqual(
      latest
    );

    await clearDraftOutboxIfMatching('proj-idb', 'chap-idb', 'latest');
    await expect(readDraftOutbox('proj-idb', 'chap-idb')).resolves.toBeNull();
  });
});

function createMemoryIndexedDb() {
  const records = new Map<string, unknown>();
  let storeExists = false;

  const database = {
    close: vi.fn(),
    createObjectStore: vi.fn(() => {
      storeExists = true;
    }),
    objectStoreNames: {
      contains: () => storeExists,
    },
    onversionchange: null,
    transaction: vi.fn(() => {
      const transaction: Record<string, unknown> = {
        error: null,
        onabort: null,
        oncomplete: null,
        onerror: null,
      };
      const complete = () => {
        void Promise.resolve().then(() => {
          const oncomplete = transaction.oncomplete as (() => void) | null;
          oncomplete?.();
        });
      };

      transaction.objectStore = () => ({
        delete: (key: string) => {
          records.delete(key);
        },
        get: (key: string) => {
          const request: Record<string, unknown> = {
            error: null,
            onerror: null,
            onsuccess: null,
            result: undefined,
          };
          void Promise.resolve().then(() => {
            request.result = records.get(key);
            const onsuccess = request.onsuccess as (() => void) | null;
            onsuccess?.();
            complete();
          });
          return request;
        },
        put: (record: { id: string }) => {
          records.set(record.id, record);
          complete();
        },
      });

      return transaction;
    }),
  };

  const factory = {
    open: vi.fn(() => {
      const request: Record<string, unknown> = {
        error: null,
        onblocked: null,
        onerror: null,
        onsuccess: null,
        onupgradeneeded: null,
        result: database,
      };
      void Promise.resolve().then(() => {
        if (!storeExists) {
          const onupgradeneeded = request.onupgradeneeded as
            | (() => void)
            | null;
          onupgradeneeded?.();
        }
        const onsuccess = request.onsuccess as (() => void) | null;
        onsuccess?.();
      });
      return request;
    }),
  } as unknown as IDBFactory;

  return { factory, records };
}
