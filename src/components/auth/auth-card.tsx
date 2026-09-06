import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { MuseLogo } from '@/components/ui/muse-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function AuthCard({
  children,
  description,
  eyebrow,
  title,
}: {
  children: ReactNode;
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-24 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-2xl shadow-primary/5 backdrop-blur sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <MuseLogo />
          <ThemeToggle />
        </div>
        <div className="mb-7">
          <p className="mb-3 flex items-center gap-2 font-semibold text-primary text-xs tracking-[0.12em] uppercase">
            <ShieldCheck className="size-4" />
            {eyebrow}
          </p>
          <h1 className="font-heading font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-6">{description}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
