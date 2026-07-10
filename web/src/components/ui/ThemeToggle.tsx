'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * ThemeToggle — switches `body.dark` and persists to localStorage.
 * Matches the design system's segmented toggle in the sidebar footer, but as
 * a single icon button suitable for the section header.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const initial = document.body.classList.contains('dark') ? 'dark' : 'light';
    setTheme(initial);
  }, []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.body.classList.toggle('dark', next === 'dark');
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem('sp_theme', next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-md border border-b-default',
        'bg-surface text-muted hover:text-text hover:bg-soft',
        'transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
