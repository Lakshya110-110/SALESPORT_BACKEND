'use client';
import { PROPOSALS_ENABLED } from '@/lib/features';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutGrid, Users, Calendar, FileText, Building2, Database, LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { session } from '@/lib/auth/session';
import { disconnectSocket } from '@/lib/socket';

/**
 * Rail — a 1:1 port of the mockup's `.rail`.
 *
 *   collapsed   width  72px  · icon-only
 *   open        width 218px  · icon + label
 *   background  linear-gradient(180deg, var(--navy), var(--ink))
 *   corner      var(--r-xl) (22px)
 *   position    sticky, top:14, height calc(100dvh - 28px)
 *
 * Chrome mirrors the mockup: `.rail-toggle` at the top, `.rail-logo` next,
 * then `.rail-nav` with `.rail-grp` dividers (a 22px horizontal rule when
 * collapsed, an UPPER-cased text label when open), `.ri` items with a fixed
 * 40×40 `.ic` box (active = filled primary with tinted shadow), and
 * `.rail-foot` with the user avatar + name.
 *
 * Behavior matches the mockup's `railClick(e)`:
 *   click on the rail body toggles unless the click landed on a nav item or
 *   the footer. Click OUTSIDE the rail while it's open collapses it back.
 */

type Item = { href: string; label: string; icon: LucideIcon };
type Group = { label: string; items: Item[]; adminOnly?: boolean };

const NAV: Group[] = [
  { label: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutGrid }] },
  {
    label: 'Sales',
    items: [
      { href: '/enquiries', label: 'Enquiries', icon: Users },
      { href: '/meetings', label: 'Meetings', icon: Calendar },
      // Proposals is hidden pending a rework — see lib/features.
      ...(PROPOSALS_ENABLED
        ? [{ href: '/proposals', label: 'Proposals', icon: FileText }]
        : []),
    ],
  },
  {
    label: 'Directory',
    items: [
      { href: '/companies', label: 'Companies', icon: Building2 },
      { href: '/contacts', label: 'Contacts', icon: Users },
      { href: '/master-data', label: 'Master data', icon: Database },
    ],
  },
  { label: 'Admin', adminOnly: true, items: [{ href: '/users', label: 'Users', icon: Users }] },
];

const K = 'sp_rail_collapsed';
const W_OPEN = 240;
const W_COLLAPSED = 80;

export function Rail() {
  const pathname = usePathname();
  const router = useRouter();
  const user = session.getUser();
  const isAdmin = user?.role === 'admin';
  const asideRef = useRef<HTMLElement | null>(null);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    try {
      const v = window.localStorage.getItem(K);
      return v === null ? true : v === '1';
    } catch { return true; }
  });

  const setState = (next: boolean) => {
    setCollapsed(next);
    try { window.localStorage.setItem(K, next ? '1' : '0'); } catch { /* noop */ }
    // Publish the width to the AppShell grid — its first column is
    // `var(--rail-w, 72px)`, so the track resizes authoritatively.
    const root = document.getElementById('app-root');
    if (root) root.style.setProperty('--rail-w', `${next ? W_COLLAPSED : W_OPEN}px`);
  };
  const toggle = () => setState(!collapsed);

  // Sync the CSS custom property on mount too.
  useEffect(() => {
    const root = document.getElementById('app-root');
    if (root) root.style.setProperty('--rail-w', `${collapsed ? W_COLLAPSED : W_OPEN}px`);
  }, [collapsed]);

  // Click-away → collapse when open.
  useEffect(() => {
    if (collapsed) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (asideRef.current && t && !asideRef.current.contains(t)) {
        setState(true);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  const logout = () => {
    disconnectSocket();
    session.clear();
    window.location.assign('/login');
  };

  // Click anywhere in the aside (except a nav item or the footer) toggles.
  const onRailClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-rail-item]') || t.closest('[data-rail-foot]') || t.closest('[data-rail-toggle]')) return;
    toggle();
  };

  return (
    <aside
      ref={asideRef}
      data-open={collapsed ? '0' : '1'}
      data-testid="rail"
      suppressHydrationWarning
      onClick={onRailClick}
      style={{
        // Width is owned by the grid track via `--rail-w`; aside fills its cell.
        // Hard-coded to the light-mode navy hexes so the rail keeps the same
        // brand chrome even when the app flips to the all-black dark theme.
        background: 'linear-gradient(180deg, #1B2A6B, #16213D)',
        borderRadius: 'var(--r-xl)',
        height: 'calc(100dvh - 28px)',
        transition: 'box-shadow .22s',
        boxShadow: collapsed ? undefined : 'var(--sh-pop)',
      }}
      className={cn(
        'sticky top-0 z-40 cursor-pointer overflow-hidden text-white',
        collapsed ? 'py-2 px-[6px]' : 'p-2',
      )}
    >
      <div className="flex h-full flex-col">
        {/* Invisible test hook so the collapse verification can still target
            a toggle. Not visible to users. */}
        <button
          type="button"
          data-rail-toggle
          data-testid="rail-toggle"
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="sr-only"
        />

        {/* .rail-logo — brand mark served from /public/logo.png. Falls back
            to a plain "S" tile if the image is missing, so the rail always
            has something to render. */}
        <div
          className={cn(
            'flex h-[54px] shrink-0 items-center overflow-hidden mb-[6px]',
            collapsed ? 'justify-center' : 'pl-3',
          )}
        >
          <span
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-white shadow-[0_2px_6px_rgba(0,0,0,0.15)]',
              collapsed ? 'h-[40px] w-[40px]' : 'h-[42px] w-[42px]',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Sort String Solutions"
              className="h-full w-full object-contain p-[3px]"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const tile = img.nextElementSibling as HTMLElement | null;
                if (tile) tile.style.display = 'flex';
              }}
            />
            <span
              className="hidden h-full w-full items-center justify-center font-display text-[15px] font-extrabold text-primary"
              aria-hidden
            >
              S
            </span>
          </span>
          <div
            className={cn(
              'ml-[10px] flex flex-col justify-center whitespace-nowrap font-display leading-[1.18] tracking-[.2px] text-white',
              collapsed ? 'hidden' : 'flex',
            )}
            aria-hidden={collapsed}
          >
            <span className="text-[12px] font-bold">Khwaishein</span>
            <span className="text-[12px] font-bold">
              Solutions <span className="text-[#9DB2E8]">CRM</span>
            </span>
          </div>
        </div>

        {/* .rail-nav */}
        <nav className="sp-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-[3px]">
          {NAV.filter((g) => !g.adminOnly || isAdmin).map((group) => (
            <div key={group.label}>
              {/* .rail-grp */}
              <div className={cn('flex items-center', collapsed ? 'h-[18px] my-[7px_1px]' : 'h-[24px] my-[9px_1px]')}>
                {collapsed ? (
                  <span className="block h-px w-[22px] mx-auto rounded-[1px] bg-white/10" />
                ) : (
                  <span className="pl-[13px] text-[9px] font-bold uppercase tracking-[.9px] whitespace-nowrap text-[#6B77A8]">
                    {group.label}
                  </span>
                )}
              </div>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    data-rail-item
                    onClick={() => { if (!collapsed) setState(true); }}
                    onMouseEnter={() => router.prefetch(item.href)}
                    onFocus={() => router.prefetch(item.href)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex h-[46px] items-center rounded-[13px] whitespace-nowrap transition-colors duration-fast',
                      collapsed ? 'pl-[10px]' : 'pl-[12px]',
                      active ? 'text-white' : 'text-white/72 hover:text-white',
                    )}
                    style={{ color: active ? '#fff' : 'rgba(255,255,255,.72)' }}
                  >
                    <span
                      className={cn(
                        'flex h-[40px] w-[40px] items-center justify-center rounded-[12px] shrink-0 mr-[10px] transition-colors duration-fast',
                        active
                          ? 'bg-primary text-white shadow-[0_6px_14px_rgba(37,71,200,0.3)]'
                          : 'text-white/72 group-hover:bg-white/10',
                      )}
                    >
                      <Icon size={20} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </span>
                    <span
                      className={cn(
                        'text-[13.5px] font-semibold transition-opacity duration-fast',
                        collapsed ? 'opacity-0' : 'opacity-100',
                      )}
                      aria-hidden={collapsed}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* .rail-foot */}
        <button
          type="button"
          data-rail-foot
          onClick={logout}
          title={collapsed ? 'Sign out' : undefined}
          className={cn(
            'mt-[6px] flex h-[52px] shrink-0 items-center rounded-[13px] border-t border-white/8 pt-[6px] transition-colors duration-fast',
            'hover:bg-white/10',
            collapsed ? 'pl-[10px]' : 'pl-[12px]',
          )}
        >
          <span className="flex w-[40px] shrink-0 items-center justify-center mr-[10px]">
            <b
              className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-primary-soft text-primary text-[12px] font-bold"
              style={user?.avatar_color ? { background: user.avatar_color, color: '#fff' } : undefined}
            >
              {user?.initials ?? 'AM'}
            </b>
          </span>
          <span
            className={cn(
              'whitespace-nowrap transition-opacity duration-fast',
              collapsed ? 'opacity-0' : 'opacity-100',
            )}
            aria-hidden={collapsed}
          >
            <div className="text-[12.5px] font-semibold text-white text-left">
              {user?.name ?? 'Signed in'}
            </div>
            <div className="text-[10.5px] text-white/55 text-left">
              {user?.role === 'admin' ? 'Owner · Admin' : 'Consultant'}
            </div>
          </span>
          <LogOut
            size={14}
            className={cn('ml-auto mr-2 text-white/50 transition-opacity duration-fast', collapsed ? 'opacity-0' : 'opacity-100')}
            aria-hidden={collapsed}
          />
        </button>
      </div>
    </aside>
  );
}
