import type { Metadata } from 'next';
import { LoginPanel } from '@/components/auth/LoginPanel';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Login screen — brand-left / form-right split.
 *
 * Left panel: navy `--ink` background, brand marks, three feature bullets,
 * copyright. Follows §01 Brand and §13 Nav sidebar colouring.
 * Right panel: LoginPanel (two-step phone → OTP flow).
 *
 * The split collapses to a single column below `md` (768px).
 */
export default function LoginPage() {
  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-2">
      {/* Left — brand */}
      {/* The panel's navy is hard-coded rather than using bg-ink, because in dark
          mode --ink resolves to pure #000000 — the whole branded side turned into
          a black rectangle and the product lost its identity on the one screen
          every user sees first. Same gradient as the app rail, so signing in and
          landing on the dashboard feel like one product. */}
      <aside
        style={{ background: 'linear-gradient(160deg, #1B2A6B, #16213D 55%, #101A33)' }}
        className="relative flex flex-col justify-between overflow-hidden px-10 py-12 text-white md:px-14 md:py-16"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          {/* Real brand mark, on a white tile because the logo is dark navy and
              would vanish against this panel.
              No onError fallback here: this page is a server component (it
              exports `metadata`), and an event handler on it fails the render
              outright — "Event handlers cannot be passed to Client Component
              props" — which took the whole login screen down with a 500. If the
              file were ever missing the alt text carries the meaning. */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Khwaishein by Sort String Solutions LLP"
              className="h-full w-full object-contain p-[3px]"
            />
          </span>
          <div>
            <div className="font-display text-base font-bold leading-tight">Khwaishein</div>
            <div className="text-[11px] text-white/60">by Sort String Solutions LLP</div>
          </div>
        </div>

        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight md:text-[42px]">
            Enterprise Lead
            <br />
            Management CRM
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70">
            Track every enquiry, meeting and proposal across your dairy &amp; FMCG pipeline — from
            first touch to closed-won.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {[
              'Real-time pipeline & consultant performance',
              'Approvals, discrepancies & oversight',
              'Meetings, proposals & negotiations in one place',
            ].map((line) => (
              <li key={line} className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[11px] text-primary">
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[11px] text-white/40">
          © {new Date().getFullYear()} Sort String Solutions LLP · Khwaishein
        </div>
      </aside>

      {/* Right — form */}
      <section className="flex items-center justify-center bg-canvas px-6 py-16">
        <LoginPanel />
      </section>
    </div>
  );
}
