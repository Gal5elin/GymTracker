import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthClient } from './auth';
const user = { id: 'user-id', displayName: 'Member', email: 'member@example.com', role: 'MEMBER', isActive: true };
const loginResponse = () => ({ ok: true, json: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 3600, user }) });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('in-memory authenticated API client', () => {
  it('sends credentials, retains only session metadata publicly and attaches bearer tokens', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce({ ok: true, status: 200 }); vi.stubGlobal('fetch', fetch);
    const client = createAuthClient();
    await client.login(' member@example.com ', 'password');
    expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ email: 'member@example.com', password: 'password' }));
    expect(client.getSession()).toEqual({ user, expiresAt: expect.any(Number) });
    await client.request('/api/auth/me', { headers: { 'X-Test': 'yes' } });
    const headers = fetch.mock.calls[1][1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('X-Test')).toBe('yes');
    expect(createAuthClient().getSession()).toBeNull();
  });
  it('clears the session after a protected 401 and stops sending removed tokens', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce({ ok: false, status: 401 }); vi.stubGlobal('fetch', fetch);
    const client = createAuthClient(); await client.login(user.email, 'password');
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(client.getSession()).toBeNull();
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('expires a session before sending another request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(loginResponse()));
    const client = createAuthClient(); await client.login(user.email, 'password');
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_600_001);
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(client.getSession()).toBeNull();
  });
  it('does not establish a session after aborted or malformed login responses', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'token' }) }); vi.stubGlobal('fetch', fetch);
    const client = createAuthClient(); const controller = new AbortController(); controller.abort();
    await client.login(user.email, 'password', controller.signal);
    expect(client.getSession()).toBeNull();
    await expect(client.login(user.email, 'password')).rejects.toThrow('Invalid login response');
    expect(client.getSession()).toBeNull();
  });
  it('rejects external destinations before attaching credentials', async () => {
    const client = createAuthClient();
    await expect(client.request('https://example.com/api/data')).rejects.toThrow('relative API path');
  });
  it('preserves the session after a forbidden response or network failure', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(loginResponse()).mockResolvedValueOnce({ ok: false, status: 403 }).mockRejectedValueOnce(new Error('offline')); vi.stubGlobal('fetch', fetch);
    const client = createAuthClient(); await client.login(user.email, 'password');
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 403 });
    await expect(client.request('/api/auth/me')).rejects.toThrow('offline');
    expect(client.getSession()?.user).toEqual(user);
  });
});
