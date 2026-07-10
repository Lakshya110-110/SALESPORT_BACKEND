import { io, type Socket } from 'socket.io-client';
import { session } from '@/lib/auth/session';

/**
 * Socket.IO connection — single shared instance for the whole app. Same
 * origin as the REST API, minus the `/api` prefix: Socket.IO's own path
 * (`/socket.io/`) lives at the app root, not under `/api`. Auth is a JWT
 * access token passed in the connection handshake (see crm/sockets.py's
 * `connect` handler) — not a cookie, matching the rest of the app's
 * bearer-token auth.
 */
const SOCKET_BASE = (
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:8000/api'
).replace(/\/api\/?$/, '');

let socket: Socket | null = null;
let socketToken: string | null = null;

/** Connects (or reuses the existing connection) using the current access
 * token. Returns null if there's no session — callers should only be
 * invoking this from an authenticated context anyway. */
export function getSocket(): Socket | null {
  const token = session.getAccess();
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io(SOCKET_BASE, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}
