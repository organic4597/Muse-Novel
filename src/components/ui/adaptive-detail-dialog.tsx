'use client';

import type { ComponentProps } from 'react';
import { DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Estimate once from saved content; no DOM measurement loop or resize listener. */
export function getDetailDialogWidth(content: readonly (string | null | undefined)[], editing = false) {
  const weight = content.reduce((total, value) => {
    const text = value?.trim().slice(0, 12_000) ?? '';
    return total + text.length + (text.match(/\n/g)?.length ?? 0) * 40;
  }, 0);
  const width = 640 + Math.min(480, Math.ceil(Math.max(0, weight - 240) / 64) * 16);
  return Math.max(editing ? 832 : 640, width);
}

export function AdaptiveDetailDialogContent({
  sizingContent,
  editing = false,
  className,
  style,
  ...props
}: ComponentProps<typeof DialogContent> & {
  sizingContent: readonly (string | null | undefined)[];
  editing?: boolean;
}) {
  return (
    <DialogContent
      {...props}
      className={cn('max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain [overflow-wrap:anywhere] [&>*]:min-w-0 [&_[data-slot=dialog-header]]:pr-8', className)}
      style={{ ...style, width: getDetailDialogWidth(sizingContent, editing), maxWidth: 'calc(100vw - 2rem)' }}
    />
  );
}
