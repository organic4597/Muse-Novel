import Link from 'next/link';

import { ThemeToggle } from '@/components/ui/theme-toggle';

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">
          <Link
            className="text-lg font-bold tracking-tight text-foreground/95"
            href="/"
          >
            뮤즈 노벨
          </Link>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              소설 목록
            </Link>
            <Link
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="/settings/ai"
            >
              AI 설정
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem]">{children}</main>
    </div>
  );
}
