// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import Root from '../Root';
const user = { id: 'test-id', displayName: 'Test member', email: 'member@example.com', role: 'MEMBER', isActive: true };
const response = () => ({ ok: true, json: async () => ({ accessToken: 'secret-token', tokenType: 'Bearer', expiresIn: 3600, user }) });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.location.hash = ''; });
async function open() { const mock = globalThis.fetch; vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.endsWith('/session') ? Promise.resolve({ ok: false, status: 401 }) : mock(url, init))); window.location.hash = 'login'; render(<Root/>); await screen.findByRole('heading', { name: 'Welcome back' }); }
function fill() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Login-password-123!' } });
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); }

describe('Login flow', () => {
  it.each(['MEMBER', 'TRAINER', 'ADMIN'])('signs out a %s, removes account details and redirects to login', async role => {
    const accountUser = { ...user, role };
    const client = createAuthClient();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'secret-token', tokenType: 'Bearer', expiresIn: 3600, user: accountUser }) }).mockResolvedValue({ ok: true, json: async () => ({ user: accountUser }) }));
    await client.login(user.email, 'password');
    window.location.hash = 'account'; render(<Root client={client}/>);
    expect(await screen.findByText('Signed in as Test member.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(window.location.hash).toBe('#login');
    expect(client.getSession()).toBeNull();
    expect(screen.queryByText('Signed in as Test member.')).toBeNull();
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('');
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('logs in, loads the real account with the token, and never persists credentials', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true, json: async () => ({ user }) }); vi.stubGlobal('fetch', fetch);
    await open(); fill(); submit();
    expect(await screen.findByText('Signed in as Test member.')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect((fetch.mock.calls[1][1].headers as Headers).get('Authorization')).toBe('Bearer secret-token');
    expect(local).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('secret-token');
    expect(window.location.hash).toBe('#account');
  });
  it('restores the account when the application remounts', async () => {
    const client = createAuthClient();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockResolvedValue({ ok: true, json: async () => ({ user }) }));
    await client.login(user.email, 'password');
    window.location.hash = 'account'; const view = render(<Root client={client}/>);
    expect(await screen.findByText('Signed in as Test member.')).toBeTruthy();
    view.unmount();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockResolvedValue({ ok: true, json: async () => ({ user }) }));
    render(<Root/>);
    expect(await screen.findByText('Signed in as Test member.')).toBeTruthy();
  });
  it('shows failed credentials and allows retry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true, json: async () => ({ user }) }); vi.stubGlobal('fetch', fetch);
    await open(); fill(); submit();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Invalid email or password.');
    submit(); expect(await screen.findByText('Signed in as Test member.')).toBeTruthy();
  });
  it.each(['network', 'server', 'validation'])('shows a retryable %s failure', async failure => {
    vi.stubGlobal('fetch', failure === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: false, status: failure === 'server' ? 500 : 400 }));
    await open(); fill(); submit();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('prevents duplicate submissions while pending', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    await open(); fill(); submit();
    expect((screen.getByRole('button', { name: 'Signing in…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText('Password').closest('form')!);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not send invalid or empty credentials', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await open(); submit();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns to sign in after a protected API rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: false, status: 401 }));
    await open(); fill(); submit();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy());
  });
});
