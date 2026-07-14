import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortAccessors<T> = Record<string, (row: T) => string | number | boolean | null | undefined>;

/**
 * Client-side table sort. Give it the rows and a map of column-key → accessor;
 * it returns the sorted rows plus the active key/direction and an onSort toggle
 * for the headers. Clicking a new column sorts ascending; clicking the active
 * column flips asc↔desc. Nulls sort last; numbers compare numerically, strings
 * use a locale/numeric-aware compare.
 *
 * Define the accessors object at MODULE scope (stable identity) so the memo
 * only recomputes when rows/key/direction change.
 */
export function useTableSort<T>(rows: T[], accessors: SortAccessors<T>) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dir, setDir] = useState<SortDir>('asc');

  const onSort = (key: string) => {
    if (activeKey === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setActiveKey(key);
      setDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const acc = activeKey ? accessors[activeKey] : null;
    if (!acc) return rows;
    const factor = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return (
        String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * factor
      );
    });
    // accessors is module-stable by contract; intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeKey, dir]);

  return { sorted, activeKey, dir, onSort };
}
