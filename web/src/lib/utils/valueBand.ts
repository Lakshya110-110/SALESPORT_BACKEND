/**
 * Deal-size bands for `expected_value`.
 *
 * Deal value is PICKED from these ranges, not typed. What gets stored is the
 * picked band's midpoint (see `mid`), because the dashboard Sum()s
 * `expected_value` for pipeline/won value and a band cannot be summed.
 *
 * The bands: three-lakh segments that SHARE their boundary up to ₹15 L — where
 * the deals actually cluster and the granularity earns its place — then wider
 * steps above that (15-20, 20-30, 30-50) and an open-ended 50 L+. Three-lakh
 * steps all the way to 50 produced 18 options, which is a dropdown nobody wants
 * to read.
 *
 *   - There is deliberately NO band below ₹1 L. Deals do not go under a lakh,
 *     so the picker must not offer one.
 *   - The shared edge belongs to the LATER band: ₹3 L exactly is "₹3–6 L".
 *     That is the whole point of sharing it — with 1-3 / 4-6 style cut-offs,
 *     ₹3.5 L falls in a hole that matches no band.
 *   - Every `mid` sits inside its own band, so picking a band and reading it
 *     back returns the same band. The open top band has no midpoint and stores
 *     its floor (₹50 L) — under-stating the pipeline rather than inventing an
 *     unbounded number.
 *   - Wider bands mean a coarser `mid`, so the pipeline estimate built from
 *     these is rougher at the top end than the bottom. That is the trade for a
 *     usable picker; the KPI is labelled "Pipeline (est.)" for exactly this
 *     reason.
 *
 * `id` is the wire value (`?value_band=`), and must stay in step with
 * VALUE_BANDS in crm/views.py. Edit both together.
 */
export type ValueBand = {
  id: string;
  label: string;
  /** Inclusive lower bound in rupees. */
  min: number;
  /** Exclusive upper bound in rupees; null = open-ended top band. */
  max: number | null;
  /** The figure stored when this band is picked — its midpoint. */
  mid: number;
};

export const VALUE_BANDS: ValueBand[] = [
  { id: '1-3', label: '₹1–3 L', min: 100000, max: 300000, mid: 200000 },
  { id: '3-6', label: '₹3–6 L', min: 300000, max: 600000, mid: 450000 },
  { id: '6-9', label: '₹6–9 L', min: 600000, max: 900000, mid: 750000 },
  { id: '9-12', label: '₹9–12 L', min: 900000, max: 1200000, mid: 1050000 },
  { id: '12-15', label: '₹12–15 L', min: 1200000, max: 1500000, mid: 1350000 },
  { id: '15-20', label: '₹15–20 L', min: 1500000, max: 2000000, mid: 1750000 },
  { id: '20-30', label: '₹20–30 L', min: 2000000, max: 3000000, mid: 2500000 },
  { id: '30-50', label: '₹30–50 L', min: 3000000, max: 5000000, mid: 4000000 },
  { id: '50+', label: '₹50 L+', min: 5000000, max: null, mid: 5000000 },
];

/**
 * The band an amount falls in, or null when there's nothing to band —
 * unset/zero/non-numeric, or (since there is no band below ₹1 L) anything
 * under a lakh. Callers render a dash: "no figure" is not a deal size.
 */
export function bandFor(value: number | string | null | undefined): ValueBand | null {
  if (value === null || value === undefined || value === '') return null;
  // Strip grouping commas before parsing: callers pass both API values
  // ("450000.00") and live field values ("4,50,000"), and Number("4,50,000")
  // is NaN — which silently yielded "no band" on every form.
  const n = Number(String(value).replace(/,/g, ''));
  if (!isFinite(n) || n <= 0) return null;
  return VALUE_BANDS.find((b) => n >= b.min && (b.max === null || n < b.max)) ?? null;
}

/** The band with this id, or null. `id` is the wire/query-param value. */
export function bandById(id: string | null | undefined): ValueBand | null {
  if (!id) return null;
  return VALUE_BANDS.find((b) => b.id === id) ?? null;
}

/** Convenience for display: the band's label, or a dash. */
export function bandLabel(value: number | string | null | undefined): string {
  return bandFor(value)?.label ?? '—';
}
