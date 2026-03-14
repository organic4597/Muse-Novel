'use client';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutoSaveIndicatorProps {
  status: SaveStatus;
  onRetry?: () => void;
}

export function AutoSaveIndicator({ status, onRetry }: AutoSaveIndicatorProps) {
  if (status === 'idle') {
    return <span className="invisible inline-flex h-5 min-w-24 items-center justify-end" />;
  }

  if (status === 'saving') {
    return (
      <span className="inline-flex h-5 min-w-24 items-center justify-end gap-1 text-xs text-muted-foreground">
        <span className="inline-block animate-spin">⟳</span>
        저장 중...
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="inline-flex h-5 min-w-24 items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>✓</span>
        저장됨
      </span>
    );
  }

  // error state — clickable to retry
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex h-5 min-w-24 items-center justify-end gap-1 text-xs text-destructive hover:underline"
    >
      <span>✕</span>
      저장 실패
    </button>
  );
}
