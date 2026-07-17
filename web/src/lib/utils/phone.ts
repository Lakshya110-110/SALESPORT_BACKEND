/**
 * Indian mobile validation — mirrors crm/phone.py. Edit both together.
 *
 * The backend enforces this on every write, so this is not the gate; it exists
 * so the user is told at the field instead of by a rejected request.
 */

/** 10 digits starting 6, 7, 8 or 9. */
export const INDIAN_MOBILE_RE = /^[6-9]\d{9}$/;

export const PHONE_ERROR =
  'Enter a valid 10-digit Indian mobile number — it must start with 6, 7, 8 or 9.';

/**
 * The subscriber digits behind any accepted format — strips separators and the
 * rendered "+91" chip, plus an explicit trunk "0" or country code "91".
 *
 * Only those two prefixes are removed. Keeping the last 10 digits of ANYTHING
 * longer (as the server's normalize_phone does, correctly, for lookup) would
 * turn the 11-digit typo "98765432101" into "8765432101" — a different, valid
 * number — so a slipped finger would pass validation and save someone else's
 * phone. Wrong lengths come back unchanged so isValidIndianMobile rejects them.
 */
export function phoneDigits(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

/** True when the value is a real Indian mobile number. */
export function isValidIndianMobile(raw: string | null | undefined): boolean {
  return INDIAN_MOBILE_RE.test(phoneDigits(raw));
}

/**
 * Live input formatter — call from a phone field's onChange so it reads
 * "98765 43210" as it's typed. Ten digits, grouped 5+5.
 *
 * Hard-caps at 10, so an 11th keystroke does nothing rather than quietly
 * producing a number that isn't one. Tolerates a pasted "+91…", "91…" or
 * leading "0" by dropping the prefix instead of the subscriber digits — the
 * naive alternative (keep the last 10) turns a paste of "+919876543210" into
 * a plausible but WRONG number.
 *
 * No "+91" chip in the output: this is the bare national number, which is
 * also what the API stores.
 */
export function formatIndianMobile(raw: string): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  digits = digits.slice(0, 10);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/**
 * The error to show for a partially-typed field, or null while it's still
 * plausible. Returns null for empty (that's a required-field question, not a
 * format one) and stays quiet until 10 digits are in — EXCEPT when the first
 * digit is already 0-5, which can never become valid no matter what follows.
 * Telling someone their number is wrong while they're still typing it is
 * noise; telling them the moment it cannot be right is help.
 */
export function phoneError(raw: string | null | undefined): string | null {
  const digits = phoneDigits(raw);
  if (digits.length === 0) return null;
  if (/^[0-5]/.test(digits)) return PHONE_ERROR;
  if (digits.length < 10) return null;
  return isValidIndianMobile(digits) ? null : PHONE_ERROR;
}
