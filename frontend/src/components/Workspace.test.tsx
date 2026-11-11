// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createAuthClient, type User } from '../api/auth';
import Root from '../Root';

const personal = ['Overview', 'My programs', 'Workout', 'History', 'Progress', 'Invitations'];
const trainer = ['Assignments', 'Member results'];
const user = { id: 'member-id', displayName: 'Alex Member', email: 'member@example.com', role: 'MEMBER', isActive: true } as User;
async function open(role: User['role'], hash = '#account', serverRole = role) {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { ...user, role } }) }).mockResolvedValue({ ok: true, json: async () => ({ user: { ...user, role: serverRole } }) });
  vi.stubGlobal('fetch', fetch);
  const client = createAuthClient(); await client.login(user.email, 'password');
  window.history.replaceState(null, '', hash); render(<Root client={client}/>);
  await screen.findByText('Alex Member', { selector: '.profile strong' });
  return { client, fetch };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('authenticated workspace navigation', () => {
  it.each(['MEMBER', 'TRAINER', 'ADMIN'] as const)('shows the correct desktop and mobile navigation for %s', async role => {
    await open(role);
    const labels = role === 'ADMIN' ? ['Overview'] : role === 'TRAINER' ? [...personal, ...trainer] : personal;
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(labels);
    expect(within(nav).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const mobile = screen.getByRole('navigation', { name: 'Mobile navigation' });
    expect(within(mobile).getAllByRole('link').map(link => link.textContent)).toEqual(labels);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByText('Build your foundation')).toBeNull();
  });
  it('uses the current API role rather than the earlier login role', async () => {
    await open('TRAINER', '#account', 'MEMBER');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).queryByRole('link', { name: 'Assignments' })).toBeNull();
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(personal);
  });
  it.each([
    ['MEMBER', '#assignments'], ['MEMBER', '#members'], ['ADMIN', '#invitations'],
    ['ADMIN', '#history'], ['ADMIN', '#programs'], ['ADMIN', '#workout'], ['ADMIN', '#progress'], ['ADMIN', '#assignments'],
  ] as const)('denies direct navigation by %s to %s', async (role, hash) => {
    await open(role, hash);
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Return to overview' })).toBeTruthy();
  });
  it('opens allowed sections, marks the active item, and closes mobile navigation', async () => {
    await open('TRAINER');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('link', { name: 'Assignments' }));
    act(() => { window.history.replaceState(null, '', '#assignments'); window.dispatchEvent(new Event('hashchange')); });
    expect(await screen.findByRole('heading', { name: 'Assignments' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Assignments' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });
  it('keeps the shell and destination visible while refreshing account details during navigation', async () => {
    const { fetch } = await open('MEMBER');
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    act(() => { window.history.replaceState(null, '', '#history'); window.dispatchEvent(new Event('hashchange')); });
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
    expect(screen.queryByText('Loading your account…')).toBeNull();
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getAllByRole('link')).toHaveLength(personal.length);
    await act(async () => { resolve({ ok: true, json: async () => ({ user }) }); });
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy();
  });
  it('shows an account-load failure and supports retry without showing role navigation', async () => {
    const client = createAuthClient();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user }) }).mockRejectedValueOnce(new Error('Connection failed')).mockResolvedValue({ ok: true, json: async () => ({ user }) });
    vi.stubGlobal('fetch', fetch); await client.login(user.email, 'password');
    window.history.replaceState(null, '', '#account'); render(<Root client={client}/>);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection failed');
    expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).queryAllByRole('link')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Welcome, Alex Member' })).toBeTruthy();
  });
});
