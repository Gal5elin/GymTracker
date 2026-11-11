// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createAuthClient, type User } from '../api/auth';
import TrainerInvitations from './TrainerInvitations';
import Root from '../Root';
const user = { id: 'trainer', displayName: 'Trainer', email: 'trainer@example.com', role: 'TRAINER', isActive: true } as User;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const created = () => ok({ invitation: { id: 'invitation', trainerId: user.id, memberId: 'member', status: 'PENDING', createdAt: '2026-11-11T12:00:00Z' } });
const failure = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });
async function open(role: User['role'] = 'TRAINER', workspace = false) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { ...user, role } }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login(user.email, 'password');
  if (workspace) { fetch.mockResolvedValue(ok({ user: { ...user, role } })); window.history.replaceState(null, '', '#invitations'); }
  const view = render(workspace ? <Root client={client}/> : <TrainerInvitations client={client}/>);
  if (workspace) await screen.findByText('Trainer', { selector: '.profile strong' });
  return { fetch, ...view };
}
function enter(value = 'member@example.com') { fireEvent.change(screen.getByLabelText('Member email'), { target: { value } }); }
function submit() { fireEvent.submit(screen.getByRole('form', { name: 'Send member invitation' })); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('sends normalized email with authentication and confirms pending rather than access granted', async () => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(created()); enter('  MEMBER@EXAMPLE.COM  '); submit();
  expect((await screen.findByRole('status')).textContent).toContain('member@example.com'); expect(screen.getByRole('status').textContent).toContain('Status: Pending');
  expect(screen.getByRole('status').textContent).toContain('Waiting for the member to accept');
  expect(fetch.mock.calls[1][0]).toContain('/api/trainer-links');
  const init = fetch.mock.calls[1][1]; expect(init.method).toBe('POST'); expect(JSON.parse(init.body)).toEqual({ email: 'member@example.com' }); expect((init.headers as Headers).get('Authorization')).toBe('Bearer token');
  expect((screen.getByLabelText('Member email') as HTMLInputElement).value).toBe('');
});
it.each(['', 'invalid', 'a@b', 'a'.repeat(250) + '@example.com'])('validates invalid email %s without sending', async value => {
  const { fetch } = await open(); enter(value); submit(); expect(screen.getByRole('alert').textContent).toContain('valid member email'); expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([
  [400, 'Bad target', 'existing active member'],
  [409, 'An invitation is already pending for this member', 'already pending'],
  [409, 'You are already connected to this member', 'already connected'],
  [403, 'Forbidden', 'Only trainers'],
  [500, 'Server error', 'Please try again'],
])('shows %s errors and preserves the recipient for correction or retry', async (status, message, expected) => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(failure(status, message)); enter(); submit();
  expect((await screen.findByRole('alert')).textContent).toContain(expected);
  expect((screen.getByLabelText('Member email') as HTMLInputElement).value).toBe('member@example.com'); expect(screen.queryByRole('status')).toBeNull();
  fetch.mockResolvedValueOnce(created()); submit(); expect(await screen.findByRole('status')).toBeTruthy();
});
it('prevents repeated submissions while sending and cancels on unmount', async () => {
  const { fetch, unmount } = await open(); let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); enter(); submit(); submit();
  expect(fetch).toHaveBeenCalledTimes(2); expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[1][1].signal as AbortSignal; unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(created()));
});
it('explains uncertain network outcomes and supports retry without losing the email', async () => {
  const { fetch } = await open(); fetch.mockRejectedValueOnce(new Error('offline')); enter(); submit();
  expect((await screen.findByRole('alert')).textContent).toContain('Could not confirm whether');
  fetch.mockResolvedValueOnce(failure(409, 'An invitation is already pending for this member')); submit(); expect((await screen.findByRole('alert')).textContent).toContain('already pending');
});
it('does not claim success for a malformed response', async () => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(ok({ invitation: { status: 'ACCEPTED' } })); enter(); submit();
  expect((await screen.findByRole('alert')).textContent).toContain('Could not confirm'); expect(screen.queryByRole('status')).toBeNull();
});
it('opens the form from the trainer workspace without sending on page load', async () => {
  const { fetch } = await open('TRAINER', true); expect(screen.getByRole('heading', { name: 'Invitations' })).toBeTruthy(); expect(screen.getByLabelText('Member email')).toBeTruthy();
  expect(fetch.mock.calls.filter(call => String(call[0]).endsWith('/api/trainer-links'))).toHaveLength(0);
});
it.each(['ADMIN'] as const)('denies direct access to the form for %s', async role => {
  const { fetch } = await open(role, true); expect(screen.getByRole('heading', { name: 'Access denied' })).toBeTruthy(); expect(screen.queryByLabelText('Member email')).toBeNull();
  expect(fetch.mock.calls.filter(call => String(call[0]).endsWith('/api/trainer-links'))).toHaveLength(0);
});
