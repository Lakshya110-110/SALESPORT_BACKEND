'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { NewEnquiryModal } from '@/components/enquiry/NewEnquiryModal';

/**
 * ModalHost — global modal provider mounted once in the (app) layout.
 *
 * Any page or component reads `useModals()` to open a global modal
 * (currently: New Enquiry) IN PLACE, without navigating. Previously the
 * dashboard's "New Enquiry" button routed to `/enquiries?new=1`, which
 * flashed the Enquiries list before the modal appeared. Now it opens on the
 * current page and, on submit, navigates to the new enquiry's detail.
 */

type ModalKey = 'newEnquiry' | null;

interface Ctx {
  open: (key: NonNullable<ModalKey>) => void;
  close: () => void;
  active: ModalKey;
}

const ModalCtx = createContext<Ctx | null>(null);

export function ModalHost({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ModalKey>(null);
  const open = useCallback((key: NonNullable<ModalKey>) => setActive(key), []);
  const close = useCallback(() => setActive(null), []);

  return (
    <ModalCtx.Provider value={{ open, close, active }}>
      {children}
      <NewEnquiryModal open={active === 'newEnquiry'} onClose={close} />
    </ModalCtx.Provider>
  );
}

export function useModals(): Ctx {
  const v = useContext(ModalCtx);
  if (!v) throw new Error('useModals must be used inside <ModalHost>');
  return v;
}
