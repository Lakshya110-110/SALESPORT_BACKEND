'use client';

import { cn } from '@/lib/utils/cn';
import type { SortDir } from '@/lib/hooks/useTableSort';

/**
 * SortableTh — a clickable column header for client-side sorted tables (pairs
 * with useTableSort). Shows a triangle that points up (asc) / down (desc) and
 * highlights the active column. Matches the standard sticky `Th` styling used
 * across the list pages (sticky top-0 so it pins inside the table's scroll box).
 */
export function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = 'left',
  className,
}: {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(
        'sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider shadow-[inset_0_-1px_0_var(--b-default)]',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'bg-primary-soft text-primary' : 'bg-sunken text-subtle hover:text-text',
        className,
      )}
    >
      <span className={cn('inline-flex items-center gap-1.5', align === 'right' && 'flex-row-reverse')}>
        {label}
        <span
          aria-hidden
          className={cn('inline-block', active ? 'opacity-100' : 'opacity-40')}
          style={{
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            ...(active && dir === 'desc'
              ? { borderTop: '5px solid currentColor' }
              : { borderBottom: '5px solid currentColor' }),
          }}
        />
      </span>
    </th>
  );
}
