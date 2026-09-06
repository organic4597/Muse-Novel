import { Feather } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

export function MuseLogo({ className }: { className?: string }) {
  return (
    <Link
      aria-label="Muse Novel 홈"
      className={cn('group flex min-w-0 items-center gap-3', className)}
      href="/"
    >
      <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl border border-primary/20 bg-primary text-primary-foreground shadow-sm transition-transform group-hover:-rotate-2">
        <Feather className="size-[1.1rem]" strokeWidth={1.8} />
        <span className="absolute inset-x-1.5 bottom-1 h-px bg-primary-foreground/40" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-[1.05rem] leading-none font-semibold tracking-[-0.025em]">
          Muse Novel
        </span>
        <span className="mt-1 block text-[0.62rem] leading-none font-medium tracking-[0.15em] text-muted-foreground uppercase">
          Writer&apos;s studio
        </span>
      </span>
    </Link>
  );
}
