'use client';

import { BookOpenText, GitBranch, Globe2, Info, Map as MapIcon, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const TABS = [
  { href: '', icon: Info, label: '작품 정보', exact: true },
  { href: '/write', icon: BookOpenText, label: '집필' },
  { href: '/plot', icon: GitBranch, label: '복선·인과' },
  { href: '/characters', icon: UsersRound, label: '캐릭터' },
  { href: '/world', icon: Globe2, label: '세계관' },
  { href: '/maps', icon: MapIcon, label: '지도' },
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
    <div className="space-y-7">
      <nav
        aria-label="프로젝트 메뉴"
        className="muse-panel flex gap-1 overflow-x-auto p-1.5"
      >
        {TABS.map(({ href, icon: Icon, label, ...rest }) => {
          const fullHref = `${base}${href}`;
          const isActive = 'exact' in rest && rest.exact
            ? pathname === fullHref
            : pathname.startsWith(fullHref);

          return (
            <Link
              className={`shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
                isActive
                  ? 'rounded-xl bg-primary text-primary-foreground shadow-sm'
                  : 'rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              href={fullHref}
              key={href}
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
