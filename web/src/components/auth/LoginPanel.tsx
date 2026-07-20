'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PhoneField } from '@/components/ui/PhoneField';
import { OtpBoxes } from '@/components/ui/OtpBoxes';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { session } from '@/lib/auth/session';
import { canUseConsole } from '@/lib/auth/console';

type Step = 'phone' | 'otp';

/** Gap enforced between OTP sends. Long enough to outlast a slow SMS so people
 *  stop re-requesting before the first one lands. */
const RESEND_COOLDOWN_SEC = 30;

/**
 * LoginPanel — the right-hand form panel of the login screen.
 * Two-step phone → OTP flow against `/api/auth/request-otp/` and `/verify-otp/`.
 * On success stores tokens + user in localStorage and navigates to /dashboard.
 *
 * Admin-only console: if the phone belongs to a consultant, we reject with a
 * pointer to the mobile field app.
 */
export function LoginPanel() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  // Seconds left before "Resend OTP" becomes clickable again. Each request
  // sends a real SMS that costs money, and the previous code stays valid for
  // its full TTL, so hammering resend just buys more codes that all work —
  // confusing to the user and billable to us.
  const [resendIn, setResendIn] = useState(0);
  const timerRef = useRef<number | null>(null);

  const startResendCooldown = () => {
    setResendIn(RESEND_COOLDOWN_SEC);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setResendIn((n) => {
        if (n <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  // Clear the interval if the panel unmounts mid-countdown, so it isn't left
  // ticking against a component that no longer exists.
  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
  }, []);

  // The input keeps a display-formatted value ("98765 43210"); the API
  // always receives bare digits.
  const rawPhone = phone.replace(/\D/g, '');

  const requestOtp = useMutation({
    mutationFn: () => endpoints.requestOtp(rawPhone),
    onSuccess: (data) => {
      setError(null);
      // Dev-mode helper: auto-fill the returned OTP so tests are one-click.
      if (data.otp) setCode(data.otp);
      setStep('otp');
      startResendCooldown();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const verifyOtp = useMutation({
    // Takes the code as an argument rather than closing over `code`. When
    // onComplete fires on the 6th keystroke, the state hasn't re-rendered yet,
    // so reading it here sent the 5-digit prefix to the server.
    mutationFn: (entered: string) => endpoints.verifyOtp(rawPhone, entered),
    onSuccess: (data) => {
      // Everyone except consultants — see lib/auth/console. This previously
      // read `role !== 'admin'`, which also locked out managers, founders and
      // sales heads with a message telling them to use the mobile app.
      if (!canUseConsole(data.user.role)) {
        setError('This account does not have web console access. Please use the mobile app.');
        return;
      }
      session.saveTokens(data.access, data.refresh, keepSignedIn);
      session.saveUser(data.user);
      router.replace('/dashboard');
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : String(err));
      // The server marks an OTP used on the FIRST verify attempt, valid or not,
      // so the digits on screen are now dead. Leaving them there invites the
      // user to press Verify again and get "Invalid or expired OTP" a second
      // time, which reads as the app being broken rather than the code being
      // spent. Clearing them points at Resend, which is the only way forward.
      setCode('');
    },
  });

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setError(null);
    requestOtp.mutate();
  };

  const submitOtp = (e?: React.FormEvent | string) => {
    if (typeof e === 'object') e?.preventDefault?.();
    // OtpBoxes' onComplete calls this the instant the 6th digit is typed —
    // a near-simultaneous manual "Verify" click could otherwise fire a
    // second mutate() while the first is still in flight.
    if (verifyOtp.isPending) return;
    // onComplete passes the freshly-typed code as a string; the "Verify"
    // button passes a FormEvent and we fall back to state.
    //
    // This MUST use the passed value. onComplete runs in the same tick as the
    // onChange that produced it, so `code` is still one keystroke behind —
    // reading it here rejected a visibly-complete code with "Enter the 6-digit
    // code", and (worse) would have submitted the 5-digit prefix. The auto-fill
    // hid this: it set all six at once and you clicked Verify a beat later, by
    // which point state had caught up. Typing the code is what exposed it.
    const entered = typeof e === 'string' ? e : code;
    if (entered.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError(null);
    verifyOtp.mutate(entered);
  };

  if (step === 'phone') {
    return (
      <form onSubmit={submitPhone} className="w-full max-w-sm">
        <h2 className="mb-1 font-display text-2xl font-bold text-text">Admin sign in</h2>
        <p className="mb-8 text-sm text-muted">
          Enter your registered mobile number to continue.
        </p>

        <PhoneField
          label="Mobile number"
          name="phone"
          autoFocus
          value={phone}
          onChange={(e) => {
            // Auto-space after the 5th digit — "98765 43210" — matching
            // every other phone field in the app.
            const d = e.target.value.replace(/\D/g, '').slice(0, 10);
            setPhone(d.length <= 5 ? d : `${d.slice(0, 5)} ${d.slice(5)}`);
          }}
          // Not a sample number: it read as real data, and it happened to be
          // an actual admin's number, which is a confusing thing to prefill-shaped.
          placeholder="Enter your 10-digit mobile number"
          error={error && !requestOtp.isPending ? error : undefined}
        />

        <label className="mb-6 flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="accent-primary"
          />
          Keep me signed in on this device
        </label>

        <Button type="submit" className="w-full" loading={requestOtp.isPending}>
          Send OTP
        </Button>

        <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-subtle">
          <Shield size={12} />
          Owner · Admin access · Sort String Solutions LLP
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitOtp} className="w-full max-w-sm">
      <h2 className="mb-1 font-display text-2xl font-bold text-text">Verify OTP</h2>
      <p className="mb-8 text-sm text-muted">
        Enter the 6-digit code sent to <b className="text-text">+91 {phone}</b>
      </p>

      <div className="mb-2">
        <OtpBoxes
          value={code}
          onChange={setCode}
          onComplete={submitOtp}
          autoFocus
          // Frozen while verifying: editing mid-flight changes the digits on
          // screen while a different code is already being checked, so the
          // result appears to belong to what's displayed when it doesn't.
          disabled={verifyOtp.isPending}
          error={!!error && !verifyOtp.isPending}
        />
      </div>

      {/* Status sits directly under the boxes, which is where the eye already is
          after typing the sixth digit. The submit button also flips to
          "Verifying…", but it's below the fold of attention at that moment — the
          boxes just grey out, which reads as nothing having happened rather than
          as work in progress, and people conclude the login failed while the
          request is still open. */}
      {verifyOtp.isPending ? (
        <p className="mb-2 flex items-center gap-2 text-[11.5px] font-medium text-primary" role="status">
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          />
          Verifying your code…
        </p>
      ) : (
        error && <p className="mb-2 text-[11.5px] text-danger">{error}</p>
      )}

      <Button
        type="submit"
        className="mt-6 w-full"
        loading={verifyOtp.isPending}
        leftIcon={<Check size={16} />}
        // Spinner alone reads as "nothing is happening" on a slow SMS network.
        // Naming the action makes the wait legible.
        disabled={verifyOtp.isPending || code.length !== 6}
      >
        {verifyOtp.isPending ? 'Verifying…' : 'Verify & sign in'}
      </Button>

      <p className="mt-5 text-center text-xs text-muted">
        Didn&rsquo;t receive it?{' '}
        <button
          type="button"
          onClick={() => requestOtp.mutate()}
          className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
          disabled={requestOtp.isPending || resendIn > 0}
        >
          {requestOtp.isPending
            ? 'Sending…'
            : resendIn > 0
              ? `Resend OTP in ${resendIn}s`
              : 'Resend OTP'}
        </button>
      </p>

      <p className="mt-3 text-center">
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setCode('');
            setError(null);
          }}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-text"
        >
          <ArrowLeft size={12} /> Change number
        </button>
      </p>
    </form>
  );
}
