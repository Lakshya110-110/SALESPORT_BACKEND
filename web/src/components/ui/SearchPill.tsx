'use client';

import { Search } from 'lucide-react';

/**
 * SearchPill — the app-wide list search field: a rounded pill with a search
 * icon and a borderless input (matches the Enquiries/Meetings look). Controlled
 * via `value`/`onChange`; `onSubmit` fires on Enter for pages that commit the
 * search (e.g. server-side URL param) rather than filtering live on every key.
 */
export function SearchPill({
  value,
  onChange,
  placeholder = 'Search…',
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: (v: string) => void;
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value.trim());
      }}
      className="flex h-10 min-w-[240px] flex-1 items-center gap-2.5 rounded-full bg-soft px-[15px]"
    >
      <Search size={15} strokeWidth={1.8} className="text-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search this list"
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text placeholder:text-subtle focus:outline-none"
      />
    </form>
  );
}
