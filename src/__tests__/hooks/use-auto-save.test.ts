import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutoSave } from '@/hooks/use-auto-save';

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
    mockFetch.mockReset();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    expect(result.current.status).toBe('idle');
  });

  it('status transitions to saving after debounce delay (2500ms)', async () => {
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

    // Advance time to trigger debounce (2500ms)
    await act(async () => {
      vi.advanceTimersByTime(2500);
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
      vi.advanceTimersByTime(2500);
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
      vi.advanceTimersByTime(2500);
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
      vi.advanceTimersByTime(2500);
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
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'muse-novel-backup-chap-1',
      'backup content'
    );
  });

  it('does NOT store content in localStorage on successful save', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(localStorageMock.setItem).not.toHaveBeenCalled();
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
      vi.advanceTimersByTime(2500);
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

  it('resets status to idle 3 seconds after saved', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content');
    });

    await act(async () => {
      vi.advanceTimersByTime(2500);
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

  it('flushes pending save immediately on unmount', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result, unmount } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('flush content');
    });

    // Unmount before debounce fires (only 500ms passed, not 2500ms)
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
      await Promise.resolve();
    });

    // fetch should have been called (flush triggered)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/proj-1/chapters/chap-1/content',
      expect.objectContaining({
        body: JSON.stringify({ contentJson: 'flush content' }),
      })
    );
  });

  it('flush() method triggers immediate save', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() =>
      useAutoSave({ projectId: 'proj-1', chapterId: 'chap-1' })
    );

    act(() => {
      result.current.save('content to flush');
    });

    // Only 1000ms passed (not enough for debounce)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Call flush manually
    await act(async () => {
      result.current.flush();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
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
      vi.advanceTimersByTime(2500);
      await Promise.resolve();
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
