/**
 * Shared PDF upload guard — used by every "upload proposal" entry point so
 * a fix here can't drift out of sync between them again. `accept` on a
 * `<input type="file">` only filters the OS picker dialog; it has no effect
 * on drag-and-drop, so this must run in the actual file handler, not rely
 * on the input's attribute alone. This is still just a UX nicety — the
 * backend does the real content-based (magic-bytes) validation.
 */
export function validatePdfFile(f: File, maxMb = 10): string | null {
  if (!f.name.toLowerCase().endsWith('.pdf') || (f.type && f.type !== 'application/pdf')) {
    return 'Only PDF files are accepted.';
  }
  if (f.size > maxMb * 1024 * 1024) {
    return `File is too large (max ${maxMb} MB).`;
  }
  return null;
}
