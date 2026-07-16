/**
 * Deal-size bands for `expected_value`.
 *
 * Deal value is PICKED from these ranges, not typed. What gets stored is the
 * picked band's midpoint (see `mid`), because the dashboard Sum()s
 * `expected_value` for pipeline/won value and a band cannot be summed.
 *
 * The bands, as specified: segments of three lakhs that SHARE their boundary —
 * 1-3, 3-6, 6-9, 9-12 … rising to 48-50, then an open-ended 50 L+.
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
  { id: '15-18', label: '₹15–18 L', min: 1500000, max: 1800000, mid: 1650000 },
  { id: '18-21', label: '₹18–21 L', min: 1800000, max: 2100000, mid: 1950000 },
  { id: '21-24', label: '₹21–24 L', min: 2100000, max: 2400000, mid: 2250000 },
  { id: '24-27', label: '₹24–27 L', min: 2400000, max: 2700000, mid: 2550000 },
  { id: '27-30', label: '₹27–30 L', min: 2700000, max: 3000000, mid: 2850000 },
  { id: '30-33', label: '₹30–33 L', min: 3000000, max: 3300000, mid: 3150000 },
  { id: '33-36', label: '₹33–36 L', min: 3300000, max: 3600000, mid: 3450000 },
  { id: '36-39', label: '₹36–39 L', min: 3600000, max: 3900000, mid: 3750000 },
  { id: '39-42', label: '₹39–42 L', min: 3900000, max: 4200000, mid: 4050000 },
  { id: '42-45', label: '₹42–45 L', min: 4200000, max: 4500000, mid: 4350000 },
  { id: '45-48', label: '₹45–48 L', min: 4500000, max: 4800000, mid: 4650000 },
  { id: '48-50', label: '₹48–50 L', min: 4800000, max: 5000000, mid: 4900000 },
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
