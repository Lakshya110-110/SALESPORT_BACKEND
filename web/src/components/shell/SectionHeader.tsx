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
        // min-h rather than a fixed h, plus flex-wrap: once the title has given up
        // all its width there is still a floor under the controls, and below that
        // they move to a second row instead of the last one sliding off the right
        // edge. The header grows only on the narrow widths that need it.
        'sticky top-0 z-30 flex min-h-[76px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-b-subtle bg-canvas px-3 py-2 xl:px-4',
        'transition-shadow duration-fast',
        scrolled && 'shadow-card',
      )}
    >
      {/* The title absorbs the squeeze, not the controls. This block used to be
          shrink-0, so as the window narrowed every lost pixel came out of the
          actions instead: the theme toggle was crushed from 36px to 24px (which
          read as the icons overlapping), "Export to Excel" wrapped onto a second
          line inside a fixed-height header, and New Enquiry was pushed off the
          right edge. Letting the title shrink lets its `truncate` do the job it
          was always there for.
          min-w-0 (not flex-1) is deliberate: flex-1 would make the title GROW
          and split the row 50/50 with the search — which is also flex-1 — so the
          search bar ended up marooned in the middle instead of filling the gap
          to the controls. min-w-0 keeps the shrink (default flex-shrink) that
          stops the controls being crushed, without the grow that stole the
          search's space. */}
      <div className="min-w-0">
        <h1 className="truncate font-display text-[28px] font-extrabold leading-tight tracking-[-0.6px] text-text">
          {title}
        </h1>
        {/* Hidden on the narrowest screens: it's context, not navigation, and
            it's the first thing worth sacrificing to keep the controls whole. */}
        {subtitle && (
          <p className="mt-1 hidden truncate text-[14px] text-subtle sm:block">{subtitle}</p>
        )}
      </div>

      {!hideSearch && <HeaderSearch />}

      {/* shrink-0 on the CHILDREN, not the group: each control keeps its real
          size (the theme toggle was being crushed 36px -> 24px, which read as
          the icons overlapping), while the group itself can still narrow so
          they wrap onto a second row rather than the last one sliding off the
          right edge. whitespace-nowrap keeps a two-word label on one line. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5 [&>*]:shrink-0 [&_button]:whitespace-nowrap">
        <NotificationsBell />
        <ThemeToggle />
        {actions}
      </div>
    </header>
  );
}
