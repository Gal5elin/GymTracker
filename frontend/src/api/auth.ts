export interface User {
  id: string;
  displayName: string;
  email: string;
  role: 'MEMBER' | 'TRAINER' | 'ADMIN';
  isActive: boolean;
}
export interface Session { user: User; expiresAt: number }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function createAuthClient() {
  const origin = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  let generation = 0;
  let token: string | null = null;
  let session: Session | null = null;
  const listeners = new Set<() => void>();
  function notify() { listeners.forEach(listener => listener()); }
  return {
    getSession: () => session,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    logout() {
      generation++;
      token = null;
      session = null;
      notify();
    },
    async login(email: string, password: string, signal?: AbortSignal) {
      const loginGeneration = generation;
      const response = await fetch(`${origin}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }), signal,
      });
      if (!response.ok) throw new ApiError(response.status, response.status === 401 ? 'Invalid email or password.' : response.status === 400 ? 'Check your email and password and try again.' : 'Sign in is unavailable right now. Please try again.');
      const data = await response.json();
      if (typeof data.accessToken !== 'string' || !data.accessToken || data.tokenType !== 'Bearer' || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0 || typeof data.user?.id !== 'string' || typeof data.user?.displayName !== 'string' || !['MEMBER', 'TRAINER', 'ADMIN'].includes(data.user?.role)) {
        throw new Error('Invalid login response');
      }
      if (signal?.aborted || generation !== loginGeneration) return;
      token = data.accessToken;
      session = { user: data.user, expiresAt: Date.now() + data.expiresIn * 1000 };
      notify();
    },
    async request(path: string, init: RequestInit = {}) {
      if (!path.startsWith('/api/') || /[\\\r\n]/.test(path)) throw new Error('Expected a relative API path');
      if (!token || !session || Date.now() >= session.expiresAt) {
        token = null; session = null; notify();
        throw new ApiError(401, 'Your session has expired. Please sign in again.');
      }
      const requestGeneration = generation;
      const requestToken = token;
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${requestToken}`);
      const response = await fetch(`${origin}${path}`, { ...init, headers, redirect: 'error' });
      if (generation !== requestGeneration) throw new ApiError(401, 'Please sign in again.');
      if (response.status === 401) {
        if (token === requestToken) { token = null; session = null; notify(); }
        throw new ApiError(401, 'Your session has expired. Please sign in again.');
      }
      if (!response.ok) throw new ApiError(response.status, 'Could not load your account. Please try again.');
      return response;
    },
  };
}
export type AuthClient = ReturnType<typeof createAuthClient>;
