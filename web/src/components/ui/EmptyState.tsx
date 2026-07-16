import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * EmptyState — what a list shows when it has nothing to show.
 *
 * Three jobs, in order: say what's missing, say whether that's normal or the
 * result of a filter, and offer the one action that fixes it. A bare "No
 * results" does the first and abandons the reader at the other two.
 *
 * `filtered` matters more than it looks: "you have no enquiries" and "your
 * filters match no enquiries" are completely different situations, and showing
 * the first when the second is true makes people think their data is gone.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  message?: string;
  /** The one thing that resolves it — usually "create" or "clear filters". */
  action?: React.ReactNode;
  className?: string;
  /** For panels/cards, where the full-height version would dwarf the box. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 p-6' : 'gap-3 p-12',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full bg-soft text-subtle',
          compact ? 'h-9 w-9' : 'h-12 w-12',
        )}
      >
        <Icon size={compact ? 16 : 22} strokeWidth={1.8} aria-hidden />
      </span>
      <div className={cn('font-display font-semibold text-text', compact ? 'text-[13px]' : 'text-[15px]')}>
        {title}
      </div>
      {message && (
        <p className={cn('max-w-[38ch] text-subtle', compact ? 'text-[11.5px]' : 'text-[12.5px]')}>
          {message}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
