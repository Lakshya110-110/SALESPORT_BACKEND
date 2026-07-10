import { session } from '@/lib/auth/session';

/**
 * Khwaishein API client.
 *
 * - Reads the base URL from `NEXT_PUBLIC_API_BASE`; the default matches the
 *   local dev backend on `http://127.0.0.1:8000/api`.
 * - Attaches `Authorization: Bearer <access>` when a session exists.
 * - On 401 with a refresh token, does one refresh attempt then retries.
 * - Throws ApiError on non-2xx so TanStack Query can surface the message.
 */

const BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000/api'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestBody = Record<string, unknown> | FormData | undefined;

async function doFetch(
  method: string,
  path: string,
  body: RequestBody,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  // FormData bodies must NOT set Content-Type — the browser fills in the
  // boundary automatically. We only set the JSON header for object bodies.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = isFormData ? (body as FormData) : JSON.stringify(body);
  return fetch(BASE_URL + path, init);
}

async function refreshAccess(): Promise<string | null> {
  const refresh = session.getRefresh();
  if (!refresh) return null;
  const resp = await doFetch('POST', '/auth/refresh/', { refresh }, null);
  if (!resp.ok) return null;
  const data = (await resp.json()) as { access?: string };
  if (data.access) {
    session.saveTokens(data.access);
    return data.access;
  }
  return null;
}

// Dedup concurrent refresh attempts. Several requests can hit 401 at once
// (e.g. a page firing off multiple widgets' queries right as the access
// token expires) — without this, each independently calls /auth/refresh/,
// wasting requests and racing on whose response's token "wins" in storage.
// If the backend ever rotates/invalidates the refresh token on use, only
// the first of those parallel calls would even succeed, forcing an
// unnecessary hard logout for a user who was actually still valid.
let refreshInFlight: Promise<string | null> | null = null;
function refreshAccessOnce(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccess().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Turns "phone" into "Phone", "gstin" into "Gstin" — good enough for a
 *  DRF field name, not meant to be a full label dictionary. */
function humanizeFieldName(field: string): string {
  const spaced = field.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** DRF's default `raise_exception=True` shape is a field-error dict —
 *  `{"phone": ["already exists."]}` or `{"non_field_errors": [...]}` for a
 *  serializer-level `validate()` failure — NOT `{"detail": "..."}`. Only
 *  a handful of hand-written views (OTP request/verify) use `detail`.
 *  Without this, every plain validation error printed as raw JSON. */
function humanizeErrorPayload(payload: unknown, fallback: string): string {
  if (Array.isArray(payload)) {
    return payload.map(String).join(' · ') || fallback;
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    const lines = Object.entries(obj).map(([field, msgs]) => {
      const text = (Array.isArray(msgs) ? msgs : [msgs]).map(String).join(' ');
      return field === 'non_field_errors' ? text : `${humanizeFieldName(field)}: ${text}`;
    });
    if (lines.length) return lines.join(' · ');
  }
  return fallback;
}

async function parseError(resp: Response): Promise<ApiError> {
  let message = `HTTP ${resp.status}`;
  let payload: unknown;
  try {
    const text = await resp.text();
    if (text) {
      payload = JSON.parse(text);
      message = humanizeErrorPayload(payload, text);
    }
  } catch {
    /* leave message as HTTP <status> */
  }
  return new ApiError(resp.status, message, payload);
}

async function request<T>(method: string, path: string, body?: RequestBody): Promise<T> {
  let resp = await doFetch(method, path, body, session.getAccess());
  if (resp.status === 401) {
    const newToken = await refreshAccessOnce();
    if (newToken) {
      resp = await doFetch(method, path, body, newToken);
    }
    if (resp.status === 401) {
      session.clear();
      if (typeof window !== 'undefined') {
        // Force a hard redirect so any stale React trees are torn down.
        window.location.assign('/login');
      }
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }
  }
  if (!resp.ok) throw await parseError(resp);
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

function qs(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const api = {
  BASE_URL,
  get: <T>(path: string, params?: Record<string, string | number | undefined | null>) =>
    request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: RequestBody) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: RequestBody) => request<T>('PATCH', path, body ?? {}),
  put: <T>(path: string, body?: RequestBody) => request<T>('PUT', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  /**
   * Multipart POST helper — call with a plain object; strings/numbers become
   * form fields and File/Blob values become file parts. The client sends
   * `multipart/form-data` with the correct boundary and skips JSON encoding.
   */
  postFormData: <T>(path: string, fields: Record<string, string | number | Blob | undefined | null>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      if (v instanceof Blob) fd.append(k, v);
      else fd.append(k, String(v));
    }
    return request<T>('POST', path, fd);
  },
};
