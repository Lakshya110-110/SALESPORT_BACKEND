'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { isValidDDMM } from '@/lib/utils/date';

/**
 * DateField — dd/mm/yyyy text input with a calendar popover.
 *
 * Matches the mockup's `.datepick` + `.calpop` pattern. Typing in the
 * input works as a masked entry; clicking the calendar icon (or focusing
 * the input) opens a month-grid popover. Selecting a day writes the
 * dd/mm/yyyy value back and closes the popover.
 *
 * The popover is rendered via `createPortal` into `document.body` with its
 * position computed from the input's `getBoundingClientRect()` — same fix
 * as `Modal` itself. Without this, opening the picker inside a Modal (whose
 * panel uses a transform-based entrance animation, and whose body scrolls
 * via `overflow-y-auto`) clipped the popover — most visibly when it flipped
 * above the input, cutting off the top rows of the month grid.
 *
 * `value` and `onChange` speak dd/mm/yyyy — the caller doesn't need to
 * know anything about the ISO conversion.
 */
export function DateField({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  disabled,
  minDate,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Days before this date are greyed out and not selectable. */
  minDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Popover is about 320px tall (header + 6 week rows + footer). If less
  // than that fits under the input in the viewport, flip it above.
  const POPOVER_H = 320;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = wrap.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const belowRoom = window.innerHeight - rect.bottom;
      const aboveRoom = rect.top;
      const above = belowRoom < POPOVER_H && aboveRoom > belowRoom;
      setCoords({
        left: rect.left,
        top: above ? undefined : rect.bottom + 6,
        bottom: above ? window.innerHeight - rect.top + 6 : undefined,
      });
    };
    reposition();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrap.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    // Capture phase + stopPropagation: a parent Modal also closes on Escape
    // via its own `document` keydown listener. Both listeners are bound to
    // the same `document` node, so registration order alone doesn't decide
    // who wins — a bubble-phase listener registered here could still fire
    // after Modal's and be too late. Capture-phase listeners on `document`
    // always run before bubble-phase ones for the same event, so this one
    // reliably intercepts Escape and stops it from ever reaching Modal —
    // closing just the popover, never the form underneath it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    // Re-measure every frame instead of only on window scroll/resize — those
    // miss layout shifts caused by something else on the page changing
    // height while nothing about the window itself moved (an accordion
    // opening, async content loading in above the field). Each check is one
    // getBoundingClientRect call, so polling for the lifetime of a single
    // open popover is negligible.
    let raf = requestAnimationFrame(function tick() {
      reposition();
      raf = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(maskDate(e.target.value))}
          onPaste={(e) => {
            // A copied "2026-07-08" is 8 digits once stripped — same length
            // as a typed "08072026" — so the generic digit mask can't tell
            // them apart and re-slices ISO order as if it were dd/mm/yyyy
            // ("20/26/0708"). Catch the ISO shape here, while we still have
            // the original separators, and convert it properly.
            const text = e.clipboardData.getData('text').trim();
            const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!iso) return;
            e.preventDefault();
            const ddmm = `${iso[3]}/${iso[2]}/${iso[1]}`;
            onChange(isValidDDMM(ddmm) ? ddmm : maskDate(text));
          }}
          onFocus={() => setOpen(true)}
          className={cn(
            'h-10 w-full rounded-md border border-b-default bg-surface pl-3 pr-10 text-[13px] text-text placeholder:text-subtle',
            'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
          )}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open calendar"
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-soft hover:text-primary"
        >
          <CalendarIcon size={15} strokeWidth={1.8} />
        </button>
      </div>
      {open && !disabled && mounted && coords && createPortal(
        <CalendarPopover
          ref={popRef}
          value={parseDDMM(value)}
          coords={coords}
          minDate={minDate}
          onPick={(d) => {
            onChange(formatDDMM(d));
            setOpen(false);
          }}
        />,
        document.body,
      )}
    </div>
  );
}

// -------------------- calendar popover --------------------

type PopoverCoords = { left: number; top?: number; bottom?: number };

type CalendarPopoverProps = {
  value: Date | null;
  onPick: (d: Date) => void;
  coords: PopoverCoords;
  minDate?: Date;
};

const CalendarPopover = forwardRef<HTMLDivElement, CalendarPopoverProps>(function CalendarPopover({ value, onPick, coords, minDate }, ref) {
  const minDay = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;
  const today = new Date();
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = value ?? today;
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  const first = new Date(view.y, view.m, 1);
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  // Monday-start: shift Sun (0) to be after Sat (6).
  const leading = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const same = (a: Date, b: Date | null) =>
    !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div
      ref={ref}
      role="dialog"
      // Portaled outside any ancestor popover's DOM subtree — this marker
      // lets an ancestor's own outside-click handler recognize "click
      // landed in a DateField/TimeField popover" via closest(), instead of
      // (wrongly) treating it as outside and closing itself. See TimeField
      // for the same marker/convention.
      data-datefield-popover
      className={cn(
        'fixed z-[95] w-[288px] max-h-[calc(100vh-24px)] overflow-y-auto sp-scroll',
        'rounded-xl border border-b-subtle bg-surface p-3 shadow-pop animate-scale-in',
      )}
      style={{ left: coords.left, top: coords.top, bottom: coords.bottom }}
    >
      {/* Header: month/year with chevron nav */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            setView((v) => ({ y: v.m === 0 ? v.y - 1 : v.y, m: v.m === 0 ? 11 : v.m - 1 }))
          }
          className="rounded-md p-1.5 text-subtle hover:bg-soft hover:text-text"
          aria-label="Previous month"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="font-display text-[13px] font-semibold text-text">{monthName}</div>
        <button
          type="button"
          onClick={() =>
            setView((v) => ({ y: v.m === 11 ? v.y + 1 : v.y, m: v.m === 11 ? 0 : v.m + 1 }))
          }
          className="rounded-md p-1.5 text-subtle hover:bg-soft hover:text-text"
          aria-label="Next month"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-center text-[10.5px] font-bold uppercase tracking-wider text-subtle">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="mt-1 grid grid-cols-7 gap-[2px]">
        {cells.map((c, i) => {
          const blocked = !!(c && minDay && c < minDay);
          return (
          <button
            key={i}
            type="button"
            disabled={!c || blocked}
            onClick={() => c && !blocked && onPick(c)}
            className={cn(
              'flex h-8 items-center justify-center rounded-md text-[12.5px] font-medium',
              !c && 'invisible',
              blocked && 'cursor-not-allowed text-subtle opacity-30',
              c && !blocked && same(c, value) && 'bg-primary text-white',
              c && !blocked && !same(c, value) && same(c, today) && 'border border-primary text-primary',
              c && !blocked && !same(c, value) && !same(c, today) && 'text-text hover:bg-primary-soft',
            )}
          >
            {c?.getDate()}
          </button>
          );
        })}
      </div>

      {/* Footer: today / clear */}
      <div className="mt-2 flex items-center justify-between border-t border-b-subtle pt-2 text-[11.5px]">
        <button
          type="button"
          onClick={() => onPick(today)}
          className="font-semibold text-primary hover:underline"
        >
          Today
        </button>
        <span className="text-subtle">
          {value ? value.toLocaleDateString('en-GB') : 'No date selected'}
        </span>
      </div>
    </div>
  );
});

// -------------------- helpers --------------------

export function maskDate(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length < 3) return d;
  if (d.length < 5) return d.slice(0, 2) + '/' + d.slice(2);
  return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
}

export function parseDDMM(s: string): Date | null {
  // isValidDDMM rejects calendar-invalid days (e.g. 31/02) before we ever
  // build a Date — `new Date(y, m, d)` silently *rolls over* an out-of-range
  // day instead of producing NaN, so an isNaN-only check here would accept
  // "31/02/2026" and quietly return March 3rd.
  if (!isValidDDMM(s)) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDDMM(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
