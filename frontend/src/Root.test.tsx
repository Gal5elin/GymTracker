// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Root from './Root';
import { createAuthClient } from './api/auth';

vi.mock('./App', () => ({ default: () => <h1>Workout demo</h1> }));
const user = { id: 'member-id', displayName: 'Member', email: 'member@example.com', role: 'MEMBER', isActive: true };
function mockApi() {
  return vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/session') ? { ok: false, status: 401 } : url.endsWith('/login')
    ? { ok: true, json: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 3600, user }) }
    : { ok: true, json: async () => ({ user }) }));
}
function navigate(hash: string, event = 'hashchange') {
  act(() => { window.history.replaceState(null, '', hash); window.dispatchEvent(new Event(event)); });
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('protected navigation', () => {
  it.each(['#account', '#dashboard', '#programs', '#workout', '#history', '#progress', '#unknown', '#demo/unknown'])('requires login for a direct link to %s', async hash => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }); vi.stubGlobal('fetch', fetch);
    window.history.replaceState(null, '', hash); render(<Root/>);
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#login'));
    expect(screen.queryByText('Workout demo')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['#demo/dashboard', '#demo/programs', '#demo/workout', '#demo/history', '#demo/progress'])('keeps explicit public demo route %s available', hash => {
    window.history.replaceState(null, '', hash); render(<Root/>);
    expect(screen.getByRole('heading', { name: 'Workout demo' })).toBeTruthy();
  });
  it('blocks account navigation via Back/Forward and direct links after logout until a fresh login', async () => {
    const fetch = mockApi(); vi.stubGlobal('fetch', fetch);
    const client = createAuthClient(); await client.login(user.email, 'password');
    window.history.replaceState(null, '', '#account'); render(<Root client={client}/>);
    expect(await screen.findByText('Signed in as Member.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => { await Promise.resolve(); });
    const callsAfterLogout = fetch.mock.calls.length;
    navigate('#account', 'popstate');
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(window.location.hash).toBe('#login');
    navigate('#history');
    expect(window.location.hash).toBe('#login');
    expect(screen.queryByText('Signed in as Member.')).toBeNull();
    await expect(client.request('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(callsAfterLogout);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Signed in as Member.')).toBeTruthy();
  });
  it('removes protected content when the session expires without another API request', async () => {
    vi.stubGlobal('fetch', mockApi());
    const client = createAuthClient(); await client.login(user.email, 'password');
    vi.useFakeTimers();
    window.history.replaceState(null, '', '#account'); render(<Root client={client}/>);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(3_600_001); });
    expect(client.getSession()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(window.location.hash).toBe('#login');
  });
  it('checks session validity when a page is restored from browser cache', async () => {
    vi.stubGlobal('fetch', mockApi());
    const client = createAuthClient(); await client.login(user.email, 'password');
    window.history.replaceState(null, '', '#account'); render(<Root client={client}/>);
    expect(await screen.findByText('Signed in as Member.')).toBeTruthy();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3_600_001);
    await act(async () => { window.dispatchEvent(new Event('pageshow')); });
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(client.getSession()).toBeNull();
  });
});

it('preserves a protected destination while restoring a persistent session', async () => {
  let resolve!: (value: unknown) => void;
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockResolvedValue({ ok: true, json: async () => ({ user }) });
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '#history'); render(<Root/>);
  expect(screen.getByRole('main', { name: 'Restoring session' })).toBeTruthy();
  expect(window.location.hash).toBe('#history');
  await act(async () => { await Promise.resolve(); resolve({ ok: true, json: async () => ({ accessToken: 'restored', expiresIn: 3600, user }) }); });
  expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
  expect(window.location.hash).toBe('#history');
});

it('offers retry after restoration fails without redirecting the requested page', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'restored', expiresIn: 3600, user }) }).mockResolvedValue({ ok: true, json: async () => ({ user }) }));
  window.history.replaceState(null, '', '#history'); render(<Root/>);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not restore your session. Please try again.');
  expect(window.location.hash).toBe('#history');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
});
