import { Activity, BookOpenCheck, LibraryBig, LogOut, Settings2 } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { MuseLogo } from '@/components/ui/muse-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { requirePageSession } from '@/lib/auth/server';

export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePageSession();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95">
        <div className="mx-auto flex h-[4.5rem] max-w-[92rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <MuseLogo />
          <nav aria-label="주 메뉴" className="flex items-center gap-1.5">
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              href="/"
            >
              <LibraryBig className="size-4" />
              <span className="hidden sm:inline">내 서재</span>
            </Link>
            <Link
              className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              href="/settings/ai"
            >
              <Settings2 className="size-4" />
              <span className="hidden sm:inline">AI 환경</span>
            </Link>
            <Link
              className="hidden h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
              href="/writing-knowledge"
            >
              <BookOpenCheck className="size-4" />
              <span className="hidden sm:inline">창작 위키</span>
            </Link>
            <Link
              className="hidden h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:inline-flex"
              href="/diagnostics"
            >
              <Activity className="size-4" />
              <span className="hidden lg:inline">운영 진단</span>
            </Link>
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <Button aria-label="로그아웃" size="icon" title="로그아웃" type="submit" variant="ghost">
                <LogOut className="size-4" />
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[92rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
