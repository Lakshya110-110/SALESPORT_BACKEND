import type { EnquiryType } from '@/lib/api/types';

/**
 * Lead type (Hot / Warm / Cold) is DERIVED from how soon the deal is
 * expected to close — it is no longer a manually-picked field.
 *
 * Bands (calendar days from today to `expected_close_date`):
 *   ≤ HOT_DAYS            → Hot   (also anything already past due)
 *   HOT_DAYS+1..WARM_DAYS → Warm
 *   > WARM_DAYS or unset  → Cold
 *
 * Tune the two constants below to shift the bands — every screen reads
 * type through `deriveType()`, so this is the single place to edit.
 */
export const HOT_DAYS = 14;
export const WARM_DAYS = 45;

export function deriveType(expectedCloseDate: string | null | undefined): EnquiryType {
  if (!expectedCloseDate) return 'Cold';
  const close = new Date(expectedCloseDate).getTime();
  if (Number.isNaN(close)) return 'Cold';
  const days = Math.ceil((close - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= HOT_DAYS) return 'Hot';
  if (days <= WARM_DAYS) return 'Warm';
  return 'Cold';
}
