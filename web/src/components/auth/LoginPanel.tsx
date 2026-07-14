'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Check, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PhoneField } from '@/components/ui/PhoneField';
import { OtpBoxes } from '@/components/ui/OtpBoxes';
import { endpoints } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/client';
import { session } from '@/lib/auth/session';

type Step = 'phone' | 'otp';

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
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
  });

  const verifyOtp = useMutation({
    mutationFn: () => endpoints.verifyOtp(rawPhone, code),
    onSuccess: (data) => {
      if (data.user.role !== 'admin') {
        setError('This account does not have web console access. Please use the mobile app.');
        return;
      }
      session.saveTokens(data.access, data.refresh, keepSignedIn);
      session.saveUser(data.user);
      router.replace('/dashboard');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : String(err)),
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
    if (code.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    setError(null);
    verifyOtp.mutate();
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
          placeholder="98765 43210"
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
          error={!!error && !verifyOtp.isPending}
        />
      </div>

      {error && <p className="mb-2 text-[11.5px] text-danger">{error}</p>}

      <Button
        type="submit"
        className="mt-6 w-full"
        loading={verifyOtp.isPending}
        leftIcon={<Check size={16} />}
      >
        Verify &amp; sign in
      </Button>

      <p className="mt-5 text-center text-xs text-muted">
        Didn&rsquo;t receive it?{' '}
        <button
          type="button"
          onClick={() => requestOtp.mutate()}
          className="font-semibold text-primary hover:underline"
          disabled={requestOtp.isPending}
        >
          Resend OTP
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
