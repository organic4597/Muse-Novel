export const THEME_STORAGE_KEY = 'muse-theme';

export type ThemePreference = 'light' | 'dark' | 'system';

export const themeInitScript = `(() => {
  const storageKey = '${THEME_STORAGE_KEY}';
  const root = document.documentElement;
  const saved = localStorage.getItem(storageKey);
  const preference = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  root.dataset.theme = preference;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
})();`;
