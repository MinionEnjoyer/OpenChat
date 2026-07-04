export type Theme = 'dark' | 'light';

const KEY = 'chat.theme';

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.remove('theme-dark', 'theme-light');
  document.documentElement.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  localStorage.setItem(KEY, theme);
}
