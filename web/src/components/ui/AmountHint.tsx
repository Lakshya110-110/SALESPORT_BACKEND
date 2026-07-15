import { inrWords } from '@/lib/utils/format';

/**
 * Restates a typed rupee amount in Indian units under the field
 * ("4,50,000" → "₹4.5 lakhs") so a mis-typed zero is caught at entry.
 *
 * The line keeps its height even when there's nothing to say, so the form
 * doesn't jump as the amount crosses ₹1,000 and the hint appears.
 */
export function AmountHint({ value }: { value: string | number | null | undefined }) {
  return (
    <span className="mt-1 block h-4 text-[11px] font-medium leading-4 text-muted">
      {inrWords(value)}
    </span>
  );
}
