'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const TABS = [
  { href: '', label: '정보', exact: true },
  { href: '/write', label: '✏️ 집필' },
  { href: '/characters', label: '👥 캐릭터' },
  { href: '/world', label: '🌍 세계관' },
] as const;

export default function ProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/projects/${params.id}`;

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-border">
        {TABS.map(({ href, label, ...rest }) => {
          const fullHref = `${base}${href}`;
          const isActive = 'exact' in rest && rest.exact
            ? pathname === fullHref
            : pathname.startsWith(fullHref);

          return (
            <Link
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              href={fullHref}
              key={href}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
