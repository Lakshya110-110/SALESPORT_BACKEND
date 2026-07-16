/**
 * Deal-size band is DERIVED from `expected_value` — the exact rupee figure is
 * still what gets typed and stored. Nothing here is persisted, so the bands can
 * be redrawn by editing this file alone; no migration, and the dashboard keeps
 * summing the real numbers.
 *
 * Same shape as leadType.ts (Hot/Warm/Cold): the frontend owns the definition
 * and the backend mirrors it to translate `?value_band=` into a range query.
 * If you edit the bands here, edit VALUE_BANDS in crm/views.py to match.
 *
 * Bands are contiguous — each runs from its `min` up to (but EXCLUDING) the next
 * one's `min` — so every amount lands in exactly one band, and each label states
 * the band's real range.
 *
 * Labels must keep matching the numbers. An earlier cut labelled these "1-3",
 * "4-6" while they actually covered 1,00,000..3,99,999 and 4,00,000..6,99,999.
 * The maths had no gaps, but the labels implied one: a ₹3.5 L deal was filed
 * under "₹1-3 L", which reads as a lie. Hence "₹1–4 L" / "₹4–7 L": the shared
 * boundary is the exclusive end of one band and the inclusive start of the next,
 * so ₹4 L exactly is "₹4–7 L" — no value is ever between two labels.
 *
 * `id` is the wire value sent to the API — keep it stable, it is a query param,
 * and it must stay in step with VALUE_BANDS in crm/views.py.
 */
export type ValueBand = {
  id: string;
  label: string;
  /** Inclusive lower bound in rupees. */
  min: number;
  /** Exclusive upper bound in rupees; null = open-ended top band. */
  max: number | null;
  /**
   * The number actually stored when this band is picked — the band's midpoint.
   *
   * Deal value is chosen from a dropdown, but `expected_value` must stay a real
   * number: the dashboard Sum()s it for pipeline/won value. So the band picks a
   * representative figure. This makes those KPIs ESTIMATES, which is the
   * accepted trade-off of banding the input.
   *
   * Every `mid` must fall inside its own band, or picking a band and reading it
   * back would land somewhere else. The open-ended top band has no midpoint, so
   * it stores its floor (₹50 L) — deliberately conservative: it under-states
   * the pipeline rather than inventing an unbounded number.
   */
  mid: number;
};

const L = 100000;

export const VALUE_BANDS: ValueBand[] = [
  { id: 'lt1', label: 'under ₹1 L', min: 0, max: 1 * L, mid: 50000 },
  { id: '1-4', label: '₹1–4 L', min: 1 * L, max: 4 * L, mid: 250000 },
  { id: '4-7', label: '₹4–7 L', min: 4 * L, max: 7 * L, mid: 550000 },
  { id: '7-11', label: '₹7–11 L', min: 7 * L, max: 11 * L, mid: 900000 },
  { id: '11-16', label: '₹11–16 L', min: 11 * L, max: 16 * L, mid: 1350000 },
  { id: '16-26', label: '₹16–26 L', min: 16 * L, max: 26 * L, mid: 2100000 },
  { id: '26-50', label: '₹26–50 L', min: 26 * L, max: 50 * L, mid: 3800000 },
  { id: '50+', label: '₹50 L+', min: 50 * L, max: null, mid: 5000000 },
];

/** The band with this id, or null. `id` is the wire/query-param value. */
export function bandById(id: string | null | undefined): ValueBand | null {
  if (!id) return null;
  return VALUE_BANDS.find((b) => b.id === id) ?? null;
}

/**
 * The band an amount falls in, or null when there's no figure to band
 * (unset/zero/non-numeric) — callers render a dash rather than "under ₹1 L",
 * since "no value entered" and "a small deal" are different things.
 */
export function bandFor(value: number | string | null | undefined): ValueBand | null {
  if (value === null || value === undefined || value === '') return null;
  // Strip grouping commas before parsing, exactly as inrWords does. Callers
  // pass both API values ("600000.00") and live field values ("3,50,000") —
  // Number("3,50,000") is NaN, which silently yielded "no band" on every form.
  const n = Number(String(value).replace(/,/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  return VALUE_BANDS.find((b) => n >= b.min && (b.max === null || n < b.max)) ?? null;
}

/** Convenience for display: the band's label, or a dash. */
export function bandLabel(value: number | string | null | undefined): string {
  return bandFor(value)?.label ?? '—';
}
