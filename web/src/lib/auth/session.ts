/**
 * Khwaishein auth session — localStorage-backed, with an in-memory fallback for
 * sandboxed iframes where localStorage can throw.
 *
 * Confirmed at CHECKPOINT 0: bearer JWT in localStorage (not httpOnly cookie).
 * If the security bar rises later, this module is the only place that changes.
 */
export type SessionUser = {
  id: number;
  phone: string;
  name: string;
  email?: string;
  role: 'admin' | 'consultant';
  avatar_color?: string;
  initials?: string;
  is_active?: boolean;
};

const K_ACCESS = 'sp_access';
const K_REFRESH = 'sp_refresh';
const K_USER = 'sp_user';
// Always in localStorage (never sensitive) — decides which store backs the
// three keys above: "keep me signed in" -> localStorage (survives browser
// close), unchecked -> sessionStorage (cleared when the tab closes).
const K_REMEMBER = 'sp_remember';

// In-memory fallback if localStorage throws (e.g. inside a sandboxed iframe).
const mem: { access: string | null; refresh: string | null; user: SessionUser | null } = {
  access: null,
  refresh: null,
  user: null,
};

function remembered(): boolean {
  try {
    return typeof window === 'undefined' ? true : window.localStorage.getItem(K_REMEMBER) !== '0';
  } catch {
    return true;
  }
}
function activeStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  return remembered() ? window.localStorage : window.sessionStorage;
}
function lsGet(k: string): string | null {
  try {
    return activeStore()?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    const s = activeStore();
    if (!s) return;
    if (v === null) s.removeItem(k);
    else s.setItem(k, v);
  } catch {
    /* swallow */
  }
}

export const session = {
  getAccess(): string | null {
    return mem.access ?? lsGet(K_ACCESS);
  },
  getRefresh(): string | null {
    return mem.refresh ?? lsGet(K_REFRESH);
  },
  getUser(): SessionUser | null {
    if (mem.user) return mem.user;
    const raw = lsGet(K_USER);
    if (!raw) return null;
    try {
      mem.user = JSON.parse(raw) as SessionUser;
      return mem.user;
    } catch {
      return null;
    }
  },
  isAuthed(): boolean {
    return !!this.getAccess();
  },
  saveTokens(access: string, refresh?: string, remember?: boolean): void {
    // Only a real login (LoginPanel) passes `remember`; the silent
    // token-refresh call in api/client.ts omits it and just re-uses
    // whichever store is already active.
    if (remember !== undefined) {
      try {
        window.localStorage.setItem(K_REMEMBER, remember ? '1' : '0');
      } catch {
        /* swallow */
      }
      // Wipe the *other* store so a mode switch can't leave stale tokens
      // readable there after the flag flips.
      try {
        const other = remember ? window.sessionStorage : window.localStorage;
        [K_ACCESS, K_REFRESH, K_USER].forEach((k) => other.removeItem(k));
      } catch {
        /* swallow */
      }
    }
    mem.access = access;
    lsSet(K_ACCESS, access);
    if (refresh !== undefined) {
      mem.refresh = refresh;
      lsSet(K_REFRESH, refresh);
    }
  },
  saveUser(user: SessionUser): void {
    mem.user = user;
    lsSet(K_USER, JSON.stringify(user));
  },
  clear(): void {
    mem.access = null;
    mem.refresh = null;
    mem.user = null;
    lsSet(K_ACCESS, null);
    lsSet(K_REFRESH, null);
    lsSet(K_USER, null);
    // Belt-and-braces: drop the keys from both backends in case a mode
    // switch happened mid-session without going through saveTokens.
    try {
      [window.localStorage, window.sessionStorage].forEach((s) => {
        s.removeItem(K_ACCESS);
        s.removeItem(K_REFRESH);
        s.removeItem(K_USER);
      });
    } catch {
      /* swallow */
    }
  },
};
