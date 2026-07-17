import type { User } from '@/lib/api/types';

/**
 * Who belongs in the web console: everyone except consultants. They're field
 * staff — the mobile app is their tool, and the console's team-wide views
 * aren't theirs to see.
 *
 * Mirrors CONSOLE_ROLES in crm/permissions.py — edit both together.
 *
 * This is the friendly gate, NOT the security boundary. It runs after
 * verify-otp has already handed back a valid token, so it can only decline to
 * store it; anyone with curl walks past. The real enforcement is IsConsoleUser
 * on the server, which is what actually refuses the data.
 *
 * Written as "not consultant" rather than a list of allowed roles on purpose:
 * a new role added later should default to HAVING console access, because the
 * alternative — a manager-equivalent silently locked out with no error anyone
 * can explain — is the failure we already had.
 */
export const CONSOLE_ROLES: ReadonlyArray<User['role']> = [
  'admin',
  'manager',
  'founder',
  'sales_head',
];

export function canUseConsole(role: User['role']): boolean {
  return role !== 'consultant';
}
