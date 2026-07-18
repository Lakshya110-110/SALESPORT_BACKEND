/**
 * dd/mm/yyyy <-> ISO (yyyy-mm-dd) helpers, shared by every date field/filter
 * in the app. Deliberately pure string manipulation — never goes through a
 * `Date` object for the ISO conversion — so there's no UTC-midnight/local-
 * timezone rollover risk (see the comment on `ddmm()` in format.ts for the
 * bug class this sidesteps).
 *
 * `isValidDDMM` is the one place calendar-day validity is checked (rejects
 * e.g. 31/02/2026, 29/02/2027) — every consumer that used to do its own
 * regex-shape-only check now goes through this instead.
 */

const DDMM_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(mm: number, yyyy: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mm === 2 && isLeapYear(yyyy)) return 29;
  return days[mm - 1];
}

/** Regex shape AND real calendar-day validity. */
export function isValidDDMM(s: string): boolean {
  const m = s.match(DDMM_RE);
  if (!m) return false;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12) return false;
  return dd >= 1 && dd <= daysInMonth(mm, yyyy);
}

/** null for '' (caller's choice to clear) or a calendar-invalid date. */
export function ddmmToISO(s: string): string | null {
  if (!s) return null;
  if (!isValidDDMM(s)) return null;
  const m = s.match(DDMM_RE)!;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Pure string split — never goes through `Date`, so no rollover risk. */
export function isoToDDMM(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Today's date in the LOCAL timezone as yyyy-mm-dd. `new Date().toISOString()`
 * gives the UTC date instead — for IST (+5:30) that's the previous day for
 * anyone logging something before ~5:30am, which then sorts as if it
 * happened a day earlier than it did.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Time-of-day greeting in the viewer's LOCAL time. `getHours()` is local (not
 * UTC) on purpose — a UTC split would show the wrong greeting to IST users for
 * the 5.5h the two clocks disagree (e.g. "Good morning" until 5:30pm IST).
 * Boundaries: morning < 12:00, afternoon 12:00–16:59, evening 17:00 onwards.
 */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Start-of-period date (as a `date_from`-ready yyyy-mm-dd), mirroring the
 *  backend's `_period_start` bucket definitions exactly — 'today'/'week'/
 *  'month' produce the same window the /dashboard/ endpoint's own KPIs use,
 *  so a widget filtered by this and the KPI strip above it never disagree.
 *  '' (all-time) returns undefined, same as the dashboard endpoint. */
export function periodStartISO(period: string): string | undefined {
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'today') return toISODate(midnight);
  if (period === 'week') {
    const d = new Date(midnight);
    d.setDate(d.getDate() - 7);
    return toISODate(d);
  }
  if (period === 'month') return toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  return undefined;
}
