'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { session } from '@/lib/auth/session';

/**
 * Root — no UI. Redirect to /dashboard if we have a token, /login otherwise.
 * The `(app)/layout.tsx` guard will bounce back to /login if the token is invalid.
 */
export default function IndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(session.isAuthed() ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
