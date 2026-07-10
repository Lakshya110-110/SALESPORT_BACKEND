'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * Top-level providers:
 *   - QueryClientProvider for TanStack Query.
 *   - Theme boot: reads `sp_theme` from localStorage (or prefers-color-scheme
 *     fallback) and applies `body.dark` per the design system.
 *
 * All are client-only. The (server) root layout renders `<Providers>` as the
 * outermost child of <body> so <Providers>' effect runs before painting.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Apply the persisted theme before first paint. Runs once, in the browser only.
  useEffect(() => {
    let theme: 'light' | 'dark' = 'light';
    try {
      const stored = window.localStorage.getItem('sp_theme');
      if (stored === 'dark' || stored === 'light') {
        theme = stored;
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        theme = 'dark';
      }
    } catch {
      /* localStorage unavailable — stay on light. */
    }
    document.body.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
