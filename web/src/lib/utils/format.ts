/**
 * Number + currency formatters that survive locales without Indian ICU data.
 * Same logic as the mockup's `_fmtInr` / `_fmtInrShort` (Task #28).
 */

function inrGroup(intStr: string): string {
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
}
function trimZero(s: string): string {
  return s.replace(/\.?0+$/, '');
}

/** -₹4,50,000 · ₹1,23,45,678 · `—` for null/NaN. */
export function fmtInr(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!isFinite(num)) return '—';
  const neg = num < 0 ? '-' : '';
  const rounded = Math.round(Math.abs(num));
  // Math.round on anything >= 1e21 returns a value whose String() is
  // exponential notation ("1e+21") — inrGroup only understands plain digit
  // strings and would mangle that into garbage like "1e,+21". Deal sizes
  // never realistically reach here; fail safely instead of rendering that.
  if (rounded >= 1e21) return '—';
  return neg + '₹' + inrGroup(String(rounded));
}

/**
 * Live input formatter — call from an amount field's onChange so commas
 * appear in Indian grouping as the user types ("1234567" → "12,34,567").
 * Returns digits + commas only; strip commas before sending to the API.
 */
export function inrInput(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  return inrGroup(digits);
}

/** -₹42Cr · ₹4.5L · ₹12k · `—` for null/NaN. Trims trailing zeros. */
export function fmtInrShort(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!isFinite(num)) return '—';
  const neg = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1e7) return neg + '₹' + trimZero((abs / 1e7).toFixed(2)) + 'Cr';
  if (abs >= 1e5) return neg + '₹' + trimZero((abs / 1e5).toFixed(2)) + 'L';
  if (abs >= 1e3) return neg + '₹' + trimZero((abs / 1e3).toFixed(1)) + 'k';
  return neg + '₹' + Math.round(abs);
}

/** Initials from a full name, up to 2 characters. */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => (p[0] || '').toUpperCase()).join('') || '?';
}

/**
 * Deterministic avatar background per user name. Palette drawn from the
 * design system so consultants get consistent tints across the app.
 */
const AVATAR_PALETTE = [
  '#0F766E', // teal
  '#1D4ED8', // primary
  '#B45309', // warning
  '#0369A1', // info
  '#15803D', // success
  '#7C3AED', // purple (kept for admin-user variety only, not brand palette)
  '#B91C1C', // danger
];

export function avatarColor(seed: string | null | undefined): string {
  if (!seed) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

/** "12m ago", "3h ago", "2d ago", "dd/mm/yyyy" fallback. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  return ddmm(iso);
}

/** dd/mm/yyyy from an ISO date/datetime string. */
export function ddmm(iso: string | null | undefined): string {
  if (!iso) return '';
  // Date-only strings ("2026-07-08") carry no timezone info, so `new Date()`
  // parses them as UTC midnight — reading back local getters rolls the date
  // back a day in negative-UTC timezones. Pure string split sidesteps that;
  // full datetime strings (which include a time + offset) are unaffected
  // and still go through `Date` below.
  const dateOnly = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return (
    String(d.getDate()).padStart(2, '0') +
    '/' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '/' +
    d.getFullYear()
  );
}

/**
 * Display formatter for Indian phone numbers — "+91 98765 43210".
 * Accepts raw 10-digit strings, 12-digit strings with a 91 prefix, or
 * anything already carrying "+91"/spaces. Falls back to the input for
 * numbers that don't look Indian (e.g. landlines with STD codes).
 */
export function fmtPhone(p: string | null | undefined): string {
  if (!p) return '';
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length !== 10) return String(p);
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}
