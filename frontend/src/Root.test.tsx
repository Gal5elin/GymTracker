// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Root from './Root';
import { createAuthClient } from './api/auth';

vi.mock('./App', () => ({ default: () => <h1>Workout demo</h1> }));
const user = { id: 'member-id', displayName: 'Member', email: 'member@example.com', role: 'MEMBER', isActive: true };
function mockApi() {
  return vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/login')
    ? { ok: true, json: async () => ({ accessToken: 'test-token', tokenType: 'Bearer', expiresIn: 3600, user }) }
    : { ok: true, json: async () => ({ user }) }));
}
function navigate(hash: string, event = 'hashchange') {
  act(() => { window.history.replaceState(null, '', hash); window.dispatchEvent(new Event(event)); });
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('protected navigation', () => {
  it.each(['#account', '#dashboard', '#programs', '#workout', '#history', '#progress', '#unknown', '#demo/unknown'])('requires login for a direct link to %s', async hash => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    window.history.replaceState(null, '', hash); render(<Root/>);
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#login'));
    expect(screen.queryByText('Workout demo')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
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
    act(() => { vi.advanceTimersByTime(3_600_001); });
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
    act(() => { window.dispatchEvent(new Event('pageshow')); });
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
    expect(client.getSession()).toBeNull();
  });
});
