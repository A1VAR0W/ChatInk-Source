import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const stored = sessionStorage.getItem('doodledrop.theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    sessionStorage.setItem('doodledrop.theme', theme);
  }, [theme]);
  return (
    <button
      type="button"
      className="icon-button"
      onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
      aria-label={`Activar tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
      title={`Tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
    >
      <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
    </button>
  );
}
