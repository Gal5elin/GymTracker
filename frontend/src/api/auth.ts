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
  let restoring: Promise<void> | null = null;
  let logoutRequest: Promise<unknown> | null = null;
  let pendingLogin: Promise<unknown> = Promise.resolve();
  function accept(data: { accessToken: string; expiresIn: number; user: User }) {
    if (typeof data.accessToken !== 'string' || !data.accessToken || data.user?.isActive !== true || !['MEMBER', 'TRAINER', 'ADMIN'].includes(data.user?.role) || typeof data.user?.displayName !== 'string' || !Number.isFinite(data.expiresIn) || data.expiresIn <= 0 || !data.user?.id) throw new Error('Invalid session response');
    token = data.accessToken;
    session = { user: data.user, expiresAt: Date.now() + data.expiresIn * 1000 };
    notify();
  }
  return {
    getSession: () => session,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    restore() {
      if (session && session.expiresAt > Date.now()) return Promise.resolve();
      if (restoring) return restoring;
      const restoreGeneration = generation;
      restoring = (async () => {
        await logoutRequest;
        const response = await fetch(`${origin}/api/auth/session`, { method: 'POST', credentials: 'include', redirect: 'error' });
        if (response.status === 401) {
          if (generation === restoreGeneration) { token = null; session = null; notify(); }
          return;
        }
        if (!response.ok) throw new ApiError(response.status, 'Could not restore your session. Please try again.');
        const data = await response.json();
        if (generation === restoreGeneration) accept(data);
      })().finally(() => { restoring = null; });
      return restoring;
    },
    logout() {
      generation++;
      token = null;
      session = null;
      notify();
      logoutRequest = pendingLogin.catch(() => {}).then(() => fetch(`${origin}/api/auth/logout`, { method: 'POST', credentials: 'include', redirect: 'error' })).then(response => {
        if (!response.ok) throw new Error('Sign out failed. Please retry.');
      });
      void logoutRequest.catch(() => {});
      return logoutRequest;
    },
    async login(email: string, password: string, signal?: AbortSignal) {
      if (logoutRequest) await logoutRequest;
      const loginGeneration = ++generation;
      const loginRequest = fetch(`${origin}/api/auth/login`, {
        method: 'POST', credentials: 'include', redirect: 'error', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }), signal,
      });
      pendingLogin = loginRequest;
      const response = await loginRequest;
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
      if (session && Date.now() >= session.expiresAt) await this.restore();
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
