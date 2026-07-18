import {
  Users,
  AlertCircle,
  FileText,
  Calendar,
  CheckCircle2,
  Info,
  Award,
  type LucideIcon,
} from 'lucide-react';
import type { Notification } from '@/lib/api/types';

/**
 * Icon + colour swatch per notification type, shared by the bell popover and
 * the toast so the same event never appears with two different faces.
 *
 * Must be lucide's own LucideIcon. A ComponentType declared with narrower props
 * isn't assignable from lucide's forwardRef icons, so hand-rolling this alias
 * breaks `next build` while `next dev` (which skips typecheck) stays green.
 */
export type IconTone = [LucideIcon, string];

export function iconForType(t: Notification['ntype']): IconTone {
  switch (t) {
    case 'pending_approval':
      return [Info, 'bg-info-soft text-info'];
    case 'discrepancy':
      return [AlertCircle, 'bg-warning-soft text-warning'];
    case 'new_enquiry':
      return [Users, 'bg-info-soft text-info'];
    case 'overdue':
      return [AlertCircle, 'bg-danger-soft text-danger'];
    case 'proposal_opened':
      return [FileText, 'bg-success-soft text-success'];
    case 'meeting_reminder':
      return [Calendar, 'bg-warning-soft text-warning'];
    case 'deal_won':
      return [Award, 'bg-success-soft text-success'];
    case 'status_changed':
      return [CheckCircle2, 'bg-primary-soft text-primary'];
    case 'team_update':
    default:
      return [Users, 'bg-accent-soft text-accent'];
  }
}

/**
 * Where a notification points, or null if it isn't navigable.
 *
 * Only `enquiry` has a detail route; `meeting` lands on the list (there's no
 * /meetings/[id] page) and `followup` has no route at all, so those toasts stay
 * unclickable rather than sending someone to a 404.
 */
export function notificationHref(n: Notification): string | null {
  if (n.link_type === 'enquiry' && n.link_id) return `/enquiries/${n.link_id}`;
  if (n.link_type === 'meeting') return '/meetings';
  return null;
}
