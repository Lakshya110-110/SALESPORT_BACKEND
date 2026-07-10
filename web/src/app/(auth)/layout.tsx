/**
 * Auth route group — no app shell. Just renders the page under the theme
 * provider. Reset any container defaults so the split panel goes edge-to-edge.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
