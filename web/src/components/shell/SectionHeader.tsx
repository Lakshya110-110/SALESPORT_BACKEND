'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationsBell } from '@/components/shell/NotificationsBell';
import { HeaderSearch } from '@/components/shell/HeaderSearch';

/**
 * SectionHeader — page topbar.
 *
 * Left:  page title + optional subtitle.
 * Right: global live-suggest search (HeaderSearch), NotificationsBell,
 *        ThemeToggle, then any page-supplied actions (typically a CTA).
 *
 * Gains a small shadow when the main scroll moves past 8px.
 */
export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Hide the search field (e.g. on the Enquiries page's own toolbar). */
  hideSearch?: boolean;
}

export function SectionHeader({ title, subtitle, actions, hideSearch }: SectionHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const scroller = document.querySelector('main');
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 8);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b border-b-subtle bg-canvas px-3 xl:px-4',
        'transition-shadow duration-fast',
        scrolled && 'shadow-card',
      )}
    >
      <div className="min-w-0 shrink-0">
        <h1 className="truncate font-display text-[28px] font-extrabold leading-tight tracking-[-0.6px] text-text">
          {title}
        </h1>
        {subtitle && <p className="mt-1 truncate text-[14px] text-subtle">{subtitle}</p>}
      </div>

      {!hideSearch && <HeaderSearch />}

      <div className={cn('ml-auto flex items-center gap-2.5', hideSearch && 'flex-1 justify-end')}>
        <NotificationsBell />
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}
