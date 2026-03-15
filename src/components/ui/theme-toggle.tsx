'use client';

import { LaptopMinimalIcon, MoonStarIcon, SunMediumIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme';

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: 'light', label: '라이트', description: '밝고 선명한 기본 화면' },
  { value: 'dark', label: '다크', description: '눈부심을 줄인 차분한 화면' },
  { value: 'system', label: '시스템', description: '기기 설정을 따라감' },
];

function getResolvedTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  const resolved = getResolvedTheme(preference);
  root.dataset.theme = preference;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme: ThemePreference =
      saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';

    setTheme(initialTheme);
    applyTheme(initialTheme);
    setMounted(true);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const current = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? 'system';
      if (current === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme = mounted
    ? getResolvedTheme(theme)
    : 'light';

  const CurrentIcon = theme === 'system'
    ? LaptopMinimalIcon
    : resolvedTheme === 'dark'
      ? MoonStarIcon
      : SunMediumIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="테마 변경"
          className="gap-2 rounded-full border-border/70 bg-background/80 px-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70"
          size="sm"
          variant="outline"
        >
          <CurrentIcon className="size-4" />
          <span className="hidden sm:inline">테마</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl border-border/70 bg-popover/95 p-2 shadow-lg backdrop-blur">
        <DropdownMenuLabel>화면 테마</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            const nextTheme = value as ThemePreference;
            setTheme(nextTheme);
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
            applyTheme(nextTheme);
          }}
          value={theme}
        >
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              className="flex items-start gap-3 rounded-lg px-3 py-2.5"
              key={option.value}
              value={option.value}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-sm leading-none">{option.label}</span>
                <span className="text-muted-foreground text-xs">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
