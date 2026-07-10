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
      <aside className="relative flex flex-col justify-between overflow-hidden bg-ink px-10 py-12 text-white md:px-14 md:py-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary font-display text-lg font-extrabold text-primary-fg">
            S
          </div>
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
