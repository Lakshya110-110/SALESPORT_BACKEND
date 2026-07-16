'use client';

/**
 * Global keyboard shortcuts.
 *
 * How shortcuts are structured:
 *   - Single-key actions ("/", "?", "n") fire immediately.
 *   - "Go to X" uses the classic Gmail-style leader: press "g", then a
 *     second key within 1.2s.
 *   - Any typing target (input/textarea/contenteditable) short-circuits
 *     everything so users don't lose keystrokes while filling forms.
 *
 * The `KeyboardShortcuts` component wires the window listeners AND owns
 * the "?" help modal. Drop it once inside `AppShell` — nothing else needs
 * to know about it.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Command } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Shortcut = {
  keys: string[]; // pretty-printed, e.g. ["G", "then", "E"]
  label: string;
  group: 'Navigate' | 'Actions' | 'App';
};

const SHORTCUTS: Shortcut[] = [
  { keys: ['G', 'then', 'D'], label: 'Go to Dashboard', group: 'Navigate' },
  { keys: ['G', 'then', 'E'], label: 'Go to Enquiries', group: 'Navigate' },
  { keys: ['G', 'then', 'M'], label: 'Go to Meetings', group: 'Navigate' },
  { keys: ['G', 'then', 'C'], label: 'Go to Companies', group: 'Navigate' },
  { keys: ['G', 'then', 'K'], label: 'Go to Contacts', group: 'Navigate' },
  { keys: ['G', 'then', 'U'], label: 'Go to Users', group: 'Navigate' },
  { keys: ['G', 'then', 'X'], label: 'Go to Master data', group: 'Navigate' },
  { keys: ['/'], label: 'Focus search', group: 'Actions' },
  { keys: ['N'], label: 'New enquiry', group: 'Actions' },
  { keys: ['R'], label: 'Refresh current page', group: 'Actions' },
  { keys: ['?'], label: 'Show this help', group: 'App' },
  { keys: ['Esc'], label: 'Close modal or menu', group: 'App' },
];

const GO_MAP: Record<string, string> = {
  d: '/dashboard',
  e: '/enquiries',
  m: '/meetings',
  c: '/companies',
  k: '/contacts',
  u: '/users',
  x: '/master-data',
};

// Any element that owns the caret should absorb every key press.
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  // Leader-key state: "g" arms `pendingLeader`; the next key within
  // ~1.2s finishes the combo.
  const pendingLeader = useRef<string | null>(null);
  const leaderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeader = () => {
    pendingLeader.current = null;
    if (leaderTimer.current) {
      clearTimeout(leaderTimer.current);
      leaderTimer.current = null;
    }
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Modifier combos are the browser's / OS's job — don't fight them.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (isTyping(ev.target)) return;

      const key = ev.key;

      // Esc: closes our help modal only. Other modals handle their own.
      if (key === 'Escape') {
        if (showHelp) {
          setShowHelp(false);
          ev.preventDefault();
        }
        clearLeader();
        return;
      }

      // Second key of a "g X" combo.
      if (pendingLeader.current === 'g') {
        const dest = GO_MAP[key.toLowerCase()];
        clearLeader();
        if (dest) {
          ev.preventDefault();
          router.push(dest);
        }
        return;
      }

      // Single-key actions.
      switch (key) {
        case '?':
          ev.preventDefault();
          setShowHelp((v) => !v);
          return;
        case '/': {
          ev.preventDefault();
          const search = document.querySelector<HTMLInputElement>(
            'input[type="search"], input[data-shortcut="search"]',
          );
          search?.focus();
          return;
        }
        case 'n':
        case 'N':
          ev.preventDefault();
          router.push('/enquiries?new=1');
          return;
        case 'r':
        case 'R':
          ev.preventDefault();
          window.location.reload();
          return;
        case 'g':
        case 'G':
          ev.preventDefault();
          pendingLeader.current = 'g';
          leaderTimer.current = setTimeout(clearLeader, 1200);
          return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (leaderTimer.current) clearTimeout(leaderTimer.current);
    };
  }, [router, showHelp]);

  return (
    <>
      <HelpButton onOpen={() => setShowHelp(true)} />
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </>
  );
}

function HelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Keyboard shortcuts (press ?)"
      title="Keyboard shortcuts (?)"
      className={cn(
        'fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center',
        'rounded-full border border-b-subtle bg-surface text-subtle shadow-pop',
        'transition-[transform,color,border-color] duration-fast',
        'hover:-translate-y-[1px] hover:border-primary/40 hover:text-primary',
      )}
    >
      <Command size={18} strokeWidth={1.8} />
    </button>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const groups = ['Navigate', 'Actions', 'App'] as const;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/40 backdrop-blur-[2px] animate-fade-in',
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full max-w-[560px] overflow-hidden rounded-card border border-b-subtle bg-surface shadow-pop',
          'animate-slide-up',
        )}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-b-subtle px-5 py-3">
          <h3 className="font-display text-[15px] font-semibold text-text">
            Keyboard shortcuts
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-subtle hover:bg-soft hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 sp-scroll">
          {groups.map((g) => (
            <section key={g} className="mb-5 last:mb-0">
              <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                {g}
              </h4>
              <ul className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-soft"
                  >
                    <span className="text-text">{s.label}</span>
                    <span className="flex items-center gap-1.5">
                      {s.keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {k === 'then' ? (
                            <span className="text-[11px] text-subtle">then</span>
                          ) : (
                            <kbd
                              className={cn(
                                'inline-flex min-w-[24px] items-center justify-center rounded-md',
                                'border border-b-subtle bg-soft px-1.5 py-0.5',
                                'font-mono text-[11px] font-semibold text-text',
                                'shadow-[0_1px_0_var(--b-default)]',
                              )}
                            >
                              {k}
                            </kbd>
                          )}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="mt-2 text-[11.5px] text-subtle">
            Tip: shortcuts are ignored while you&rsquo;re typing in an input or
            editor. Press <kbd className="rounded border border-b-subtle bg-soft px-1 py-0.5 font-mono text-[10.5px]">?</kbd>{' '}
            anywhere to reopen this list.
          </p>
        </div>
      </div>
    </div>
  );
}
