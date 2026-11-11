// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createAuthClient, type User } from '../api/auth';
import type { ReceivedInvitation } from '../api/trainer-links';
import InvitationInbox from './InvitationInbox';
import Root from '../Root';
const user = { id: 'member', displayName: 'Member', email: 'member@example.com', role: 'MEMBER', isActive: true } as User;
const invitation: ReceivedInvitation = { id: 'link', trainerId: 'trainer', memberId: user.id, status: 'PENDING', createdAt: '2026-11-11T12:00:00Z', trainer: { id: 'trainer', displayName: 'Alex Trainer' } };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const list = (invitations = [invitation]) => ok({ invitations });
const failed = (status: number) => ({ ok: false, status, json: async () => ({ error: 'failed' }) });
async function open(rows = [invitation], workspace = false, role: User['role'] = 'MEMBER') {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { ...user, role } }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login(user.email, 'password');
  if (workspace) { fetch.mockResolvedValueOnce(ok({ user: { ...user, role } })); window.history.replaceState(null, '', '#invitations'); }
  fetch.mockResolvedValueOnce(list(rows));
  const view = render(workspace ? <Root client={client}/> : <InvitationInbox client={client}/>);
  if (role === 'MEMBER') await screen.findByRole('heading', { name: rows.length ? rows[0].trainer.displayName : 'No invitations yet' });
  else await screen.findByText('Member', { selector: '.profile strong' });
  return { fetch, client, ...view };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('lists trainer names, dates and all statuses with actions only for pending invitations', async () => {
  const rows = [invitation, ...(['ACCEPTED', 'REJECTED', 'REVOKED'] as const).map(status => ({ ...invitation, id: status, status, trainer: { ...invitation.trainer, displayName: status } }))];
  const { fetch } = await open(rows);
  for (const text of ['Pending', 'Accepted', 'Rejected', 'Revoked']) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1); expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);
  expect(screen.getAllByText('11 Nov 2026')).toHaveLength(4);
  expect(fetch.mock.calls[1][0]).toMatch(/\/api\/trainer-links$/); expect((fetch.mock.calls[1][1].headers as Headers).get('Authorization')).toBe('Bearer token');
});
it.each(['ACCEPTED', 'REJECTED'] as const)('saves %s and displays the authoritative status with no response actions', async status => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(ok({ invitation: { ...invitation, status } }));
  fireEvent.click(screen.getByRole('button', { name: status === 'ACCEPTED' ? 'Accept' : 'Reject' }));
  expect(await screen.findByText(status === 'ACCEPTED' ? 'Accepted' : 'Rejected')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Alex Trainer');
  expect(fetch.mock.calls[2][1].method).toBe('PATCH'); expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ status });
});
it('shows empty inbox and reloads newly received invitations', async () => {
  const { fetch } = await open([]); expect(screen.getByText('No invitations yet')).toBeTruthy();
  fetch.mockResolvedValueOnce(list()); fireEvent.click(screen.getByRole('button', { name: 'Refresh invitations' })); expect(await screen.findByText('Alex Trainer')).toBeTruthy();
});
it('refreshes saved status after a conflict instead of overwriting a decision', async () => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(failed(409)).mockResolvedValueOnce(list([{ ...invitation, status: 'REJECTED' }]));
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
  expect(await screen.findByText('Rejected')).toBeTruthy(); expect(screen.getByRole('alert').textContent).toContain('saved statuses'); expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
});
it('recovers a lost success response by reading the saved decision', async () => {
  const { fetch } = await open(); fetch.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(list([{ ...invitation, status: 'ACCEPTED' }]));
  fireEvent.click(screen.getByRole('button', { name: 'Accept' })); expect(await screen.findByText('Accepted')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
});
it('blocks uncertain response retries until a successful refresh', async () => {
  const { fetch } = await open(); fetch.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept' })); expect((await screen.findByRole('alert')).textContent).toContain('Refresh invitations before responding again');
  expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(true);
  fetch.mockResolvedValueOnce(list()); fireEvent.click(screen.getByRole('button', { name: 'Refresh invitations' }));
  await act(async () => {}); expect((screen.getByRole('button', { name: 'Accept' }) as HTMLButtonElement).disabled).toBe(false);
});
it('prevents repeated response requests and aborts when leaving', async () => {
  const { fetch, unmount } = await open(); let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const accept = screen.getByRole('button', { name: 'Accept' }); fireEvent.click(accept); fireEvent.click(accept);
  expect(fetch).toHaveBeenCalledTimes(3); expect((screen.getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[2][1].signal as AbortSignal; unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve(ok({ invitation: { ...invitation, status: 'ACCEPTED' } })));
});
it('keeps existing rows after a refresh failure and retries', async () => {
  const { fetch } = await open(); fetch.mockResolvedValueOnce(failed(500)); fireEvent.click(screen.getByRole('button', { name: 'Refresh invitations' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByText('Alex Trainer')).toBeTruthy();
  fetch.mockResolvedValueOnce(list([])); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('No invitations yet')).toBeTruthy();
});
it('retries an initial list failure', async () => {
  const { fetch, client, unmount } = await open(); unmount();
  fetch.mockResolvedValueOnce(failed(500)); render(<InvitationInbox client={client}/>); expect(await screen.findByRole('alert')).toBeTruthy();
  fetch.mockResolvedValueOnce(list()); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByText('Alex Trainer')).toBeTruthy();
});
it('opens the member inbox through the guarded workspace', async () => {
  await open([invitation], true); expect(screen.getByRole('heading', { name: 'Invitations' })).toBeTruthy(); expect(screen.queryByLabelText('Member email')).toBeNull();
  expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Invitations' }).getAttribute('aria-current')).toBe('page');
});
it('does not expose the member inbox to administrators', async () => {
  const { fetch } = await open([], true, 'ADMIN'); expect(screen.getByRole('heading', { name: 'Access denied' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  expect(fetch.mock.calls.filter(call => String(call[0]).endsWith('/api/trainer-links'))).toHaveLength(0);
});

const accepted: ReceivedInvitation = { ...invitation, status: 'ACCEPTED' };
function revoke() { fireEvent.click(screen.getByRole('button', { name: 'Revoke collaboration' })); }
function confirm() { fireEvent.click(screen.getByRole('button', { name: 'Confirm revocation' })); }
it('offers revocation only for accepted relationships and cancels confirmation without a request', async () => {
  const { fetch } = await open([accepted]); revoke();
  expect(screen.getByRole('group', { name: 'Revoke collaboration with Alex Trainer?' })).toBeTruthy();
  expect(screen.getByText(/Your existing programs and workout history stay available/)).toBeTruthy();
  const cancel = screen.getByRole('button', { name: 'Cancel' }); expect(document.activeElement).toBe(cancel);
  fireEvent.click(cancel); expect(screen.queryByRole('button', { name: 'Confirm revocation' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Revoke collaboration' })); expect(fetch).toHaveBeenCalledTimes(2);
  revoke(); fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), { key: 'Escape' }); expect(screen.queryByRole('group')).toBeNull(); expect(fetch).toHaveBeenCalledTimes(2);
});
it('revokes after explicit confirmation and displays the saved status', async () => {
  const { fetch } = await open([accepted]); fetch.mockResolvedValueOnce(ok({ invitation: { ...accepted, status: 'REVOKED' } })); revoke(); confirm();
  expect(await screen.findByText('Revoked')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Revoke collaboration' })).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Your existing programs and workout history remain available');
  expect(fetch.mock.calls[2][0]).toMatch(/\/api\/trainer-links\/link$/); expect(fetch.mock.calls[2][1].method).toBe('PATCH'); expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ status: 'REVOKED' });
  expect((fetch.mock.calls[2][1].headers as Headers).get('Authorization')).toBe('Bearer token');
});
it('prevents duplicate revocations and cancels requests when leaving', async () => {
  const { fetch, unmount } = await open([accepted]); let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); revoke(); const button = screen.getByRole('button', { name: 'Confirm revocation' }); fireEvent.click(button); fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(3); expect((screen.getByRole('button', { name: 'Revoke collaboration' }) as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[2][1].signal as AbortSignal; unmount(); expect(signal.aborted).toBe(true); await act(async () => resolve(ok({ invitation: { ...accepted, status: 'REVOKED' } })));
});
it.each([409, 403, 500])('recovers a failed revocation (%s) and requires fresh confirmation to retry', async status => {
  const { fetch } = await open([accepted]); fetch.mockResolvedValueOnce(failed(status)).mockResolvedValueOnce(list([accepted])); revoke(); confirm();
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByText('Accepted')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Confirm revocation' })).toBeNull();
  fetch.mockResolvedValueOnce(ok({ invitation: { ...accepted, status: 'REVOKED' } })); revoke(); confirm(); expect(await screen.findByText('Revoked')).toBeTruthy();
});
it('reads back a revocation when the success response is lost', async () => {
  const { fetch } = await open([accepted]); fetch.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce(list([{ ...accepted, status: 'REVOKED' }])); revoke(); confirm();
  expect(await screen.findByText('Revoked')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Revoke collaboration' })).toBeNull();
});
it('blocks another revocation when its saved state is uncertain until refresh succeeds', async () => {
  const { fetch } = await open([accepted]); fetch.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')); revoke(); confirm();
  expect((await screen.findByRole('alert')).textContent).toContain('Refresh invitations before responding again');
  expect((screen.getByRole('button', { name: 'Revoke collaboration' }) as HTMLButtonElement).disabled).toBe(true);
  fetch.mockResolvedValueOnce(list([{ ...accepted, status: 'REVOKED' }])); fireEvent.click(screen.getByRole('button', { name: 'Refresh invitations' })); expect(await screen.findByText('Revoked')).toBeTruthy();
});
it('keeps member program and history navigation after revocation', async () => {
  const { fetch } = await open([accepted], true); fetch.mockResolvedValueOnce(ok({ invitation: { ...accepted, status: 'REVOKED' } })); revoke(); confirm(); await screen.findByText('Revoked');
  const nav = within(screen.getByRole('navigation', { name: 'Main navigation' }));
  expect(nav.getByRole('link', { name: 'My programs' }).getAttribute('href')).toBe('#programs'); expect(nav.getByRole('link', { name: 'History' }).getAttribute('href')).toBe('#history'); expect(nav.getByRole('link', { name: 'Workout' }).getAttribute('href')).toBe('#workout');
});
