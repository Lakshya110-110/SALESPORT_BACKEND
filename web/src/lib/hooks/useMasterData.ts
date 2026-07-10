'use client';

import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api/endpoints';

type MasterDataCategory = 'industry' | 'source' | 'status' | 'enquiry_type' | 'mode';

/**
 * Every Industry/Source/Status/Type/Meeting-mode picker in the app reads
 * from Master Data now, instead of a local hardcoded array each screen
 * kept its own (slightly-drifting) copy of. `fallback` only covers the
 * narrow window before the category has ever been seeded/populated, or if
 * an admin empties it out entirely — once real rows exist, they're what's
 * shown, so anything added on the Master Data page actually appears here.
 */
export function useMasterDataValues(category: MasterDataCategory, fallback: readonly string[]): string[] {
  const q = useQuery({
    queryKey: ['master-data', 'values', category],
    queryFn: () => endpoints.masterData(category),
    staleTime: 5 * 60 * 1000,
  });
  const items = q.data?.results ?? [];
  if (items.length === 0) return [...fallback];
  return [...items]
    .filter((i) => i.is_active)
    .sort((a, b) => a.order - b.order)
    .map((i) => i.value);
}
