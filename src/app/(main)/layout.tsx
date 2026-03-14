import Link from 'next/link';

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            className="text-lg font-bold tracking-tight"
            href="/"
          >
            뮤즈 노벨
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              href="/"
            >
              소설 목록
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
