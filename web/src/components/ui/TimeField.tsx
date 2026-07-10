'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * TimeField — 24h HH:MM text input with a clock popover.
 *
 * The popover shows two vertical scroll columns (hours 00–23, minutes in
 * 5-min steps) plus a 12h AM/PM display. Selecting a value writes back
 * `HH:MM` and closes the popover.
 *
 * Rendered via `createPortal` into `document.body` with position computed
 * from the input's `getBoundingClientRect()` — same fix as `DateField` and
 * `Modal`: nested inside a Modal's `overflow-y-auto` body, a plain
 * `position: absolute` popover gets clipped.
 */
export function TimeField({
  value,
  onChange,
  placeholder = 'HH:MM',
  disabled,
  minuteStep = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minuteStep?: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const POPOVER_H = 260;

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
    // Capture phase + stopPropagation — see DateField's identical comment:
    // guarantees this listener intercepts Escape before a parent Modal's
    // own document-level Escape handler can close the whole form.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    // Re-measure every frame — see DateField's identical comment for why
    // scroll/resize listeners alone miss non-window layout shifts.
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

  const [hh, mm] = split(value);
  const twelve = hh === null ? null : (((hh + 11) % 12) + 1);
  const ampm = hh === null ? '' : hh < 12 ? 'AM' : 'PM';

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder={placeholder}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(maskTime(e.target.value))}
          onFocus={() => setOpen(true)}
          className={cn(
            'h-10 w-full rounded-md border border-b-default bg-surface pl-3 pr-10 text-[13px] text-text placeholder:text-subtle',
            'focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-soft',
          )}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Open clock picker"
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-subtle hover:bg-soft hover:text-primary"
        >
          <Clock size={15} strokeWidth={1.8} />
        </button>
      </div>
      {open && !disabled && mounted && coords && createPortal(
        <div
          ref={popRef}
          role="dialog"
          // See DateField's CalendarPopover — same marker, same reason: lets
          // an ancestor popover's outside-click handler recognize this as
          // "still inside" even though it's portaled outside its DOM subtree.
          data-datefield-popover
          className={cn(
            'fixed z-[95] w-[220px] max-h-[calc(100vh-24px)] overflow-y-auto sp-scroll',
            'rounded-xl border border-b-subtle bg-surface p-3 shadow-pop animate-scale-in',
          )}
          style={{ left: coords.left, top: coords.top, bottom: coords.bottom }}
        >
          {/* 12h display */}
          <div className="mb-2 text-center font-display text-[18px] font-extrabold text-text">
            {twelve !== null ? String(twelve).padStart(2, '0') : '—'}:{value.split(':')[1] || '--'}
            <span className="ml-2 text-[11px] font-semibold text-subtle">{ampm}</span>
          </div>

          {/* Two scroll columns */}
          <div className="grid grid-cols-2 gap-2">
            <Column
              label="Hour"
              values={Array.from({ length: 24 }, (_, i) => i)}
              selected={hh}
              format={(n) => String(n).padStart(2, '0')}
              onPick={(nh) => onChange(`${String(nh).padStart(2, '0')}:${(value.split(':')[1] || '00').padStart(2, '0')}`)}
            />
            <Column
              label="Min"
              values={Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep)}
              selected={mm}
              format={(n) => String(n).padStart(2, '0')}
              onPick={(nm) => onChange(`${(value.split(':')[0] || '09').padStart(2, '0')}:${String(nm).padStart(2, '0')}`)}
            />
          </div>

          {/* Footer quick picks */}
          <div className="mt-3 flex flex-wrap gap-1 border-t border-b-subtle pt-2">
            {['09:00', '11:00', '15:00', '17:00'].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => { onChange(v); setOpen(false); }}
                className="rounded-full bg-soft px-2 py-1 text-[11px] font-semibold text-muted hover:bg-primary-soft hover:text-primary"
              >
                {v}
              </button>
            ))}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11.5px] font-semibold text-primary hover:underline"
            >
              Done
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Column({
  label,
  values,
  selected,
  format,
  onPick,
}: {
  label: string;
  values: number[];
  selected: number | null;
  format: (n: number) => string;
  onPick: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div className="sp-scroll h-32 overflow-y-auto rounded-md bg-soft/40">
        {values.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={cn(
              'block w-full py-1 text-center font-mono text-[12.5px]',
              n === selected
                ? 'bg-primary text-white'
                : 'text-text hover:bg-primary-soft',
            )}
          >
            {format(n)}
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------- helpers --------------------

export function maskTime(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  if (d.length < 3) return d;
  return d.slice(0, 2) + ':' + d.slice(2);
}

function split(v: string): [number | null, number | null] {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return [null, null];
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return [null, null];
  return [h, mi];
}
