import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

export const DEFAULT_PROGRESSIVE_PAGE_SIZE = 48;

export function nextProgressiveCount(
  current: number,
  total: number,
  pageSize = DEFAULT_PROGRESSIVE_PAGE_SIZE
) {
  if (total <= 0) return 0;
  return Math.min(total, Math.max(0, current) + Math.max(1, pageSize));
}

export function ProgressiveListControls({
  onLoadMore,
  pageSize = DEFAULT_PROGRESSIVE_PAGE_SIZE,
  shown,
  total,
}: {
  onLoadMore: () => void;
  pageSize?: number;
  shown: number;
  total: number;
}) {
  if (total <= 0) return null;

  const safeShown = Math.min(Math.max(shown, 0), total);
  const remaining = Math.max(0, total - safeShown);

  return (
    <div
      aria-label="목록 표시 범위"
      className="flex flex-col items-center justify-center gap-2 pt-2 sm:flex-row"
    >
      <p className="text-xs tabular-nums text-muted-foreground">
        {total.toLocaleString('ko-KR')}개 중 {safeShown.toLocaleString('ko-KR')}개
        표시
      </p>
      {remaining > 0 && (
        <Button onClick={onLoadMore} size="sm" type="button" variant="outline">
          <ChevronDown />
          {Math.min(pageSize, remaining).toLocaleString('ko-KR')}개 더 보기
        </Button>
      )}
    </div>
  );
}
