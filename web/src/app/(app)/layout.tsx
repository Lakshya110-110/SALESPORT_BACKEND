import { AppShell } from '@/components/shell/AppShell';

/**
 * `(app)` group — everything behind the auth wall.
 * Wraps every page in the Rail + main-scroll shell.
 */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
