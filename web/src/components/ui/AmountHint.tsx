import { inrWords } from '@/lib/utils/format';
import { bandLabel } from '@/lib/utils/valueBand';

/**
 * Restates a typed rupee amount in Indian units under the field
 * ("4,50,000" → "₹4.5 lakhs") so a mis-typed zero is caught at entry.
 *
 * With `showBand`, it also names the deal-size band the amount falls in
 * ("₹4.5 lakhs · ₹4–7 L") — used on the expected-deal-value fields so the band
 * shown here is the same one the list, filter and detail tile will show. The
 * band is derived, never stored; the exact figure stays the truth.
 *
 * The line keeps its height even when there's nothing to say, so the form
 * doesn't jump as the amount crosses ₹1,000 and the hint appears.
 */
export function AmountHint({
  value,
  showBand = false,
}: {
  value: string | number | null | undefined;
  showBand?: boolean;
}) {
  const words = inrWords(value);
  const band = showBand ? bandLabel(value) : '—';
  // bandLabel returns '—' for "no figure entered" — don't append that.
  const text = words && showBand && band !== '—' ? `${words} · ${band}` : words;
  return (
    <span className="mt-1 block h-4 text-[11px] font-medium leading-4 text-muted">
      {text}
    </span>
  );
}
