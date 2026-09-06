'use client';

import { cn } from '@/lib/utils';

import { Toolbar } from './toolbar';

export function FixedToolbar(props: React.ComponentProps<typeof Toolbar>) {
  return (
    <Toolbar
      {...props}
      className={cn(
        'sticky top-0 left-0 z-50 w-full flex-wrap justify-between overflow-x-auto rounded-none border-b border-b-border/60 bg-card/95 px-3 py-1.5 sm:px-5',
        props.className
      )}
    />
  );
}
