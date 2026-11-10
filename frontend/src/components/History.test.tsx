// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import type { HistoryDetail, HistorySummary } from '../api/history';
import History from './History';
import Root from '../Root';
const id = 'a1111111-1111-4111-8111-111111111111', nextId = 'b2222222-2222-4222-8222-222222222222';
const user = { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true };
const summary: HistorySummary = { id, status: 'COMPLETED', startedAt: '2026-11-10T12:00:00Z', finishedAt: '2026-11-10T13:00:00Z', program: { id: 'program', name: 'Saved strength' }, day: { id: 'day', dayNumber: 3, title: 'Saved day' }, snapshotAvailable: true, setCount: 3 };
const detail: HistoryDetail = { ...summary, notes: 'Saved note\nSecond line', exercises: [
  { exerciseId: 'squat', exercisePosition: 2, name: 'Saved squat', muscleGroup: 'Legs', equipment: 'Barbell', sets: [{ id: 'set-1', setNumber: 1, reps: 9, weightKg: '12.35', createdAt: summary.startedAt }, { id: 'set-2', setNumber: 2, reps: 6, weightKg: '0', createdAt: summary.startedAt }] },
  { exerciseId: 'squat', exercisePosition: 5, name: 'Saved squat', muscleGroup: 'Legs', equipment: 'Barbell', sets: [{ id: 'set-3', setNumber: 2, reps: 15, weightKg: null, createdAt: summary.startedAt }] },
] };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const auth = () => ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function open(sessionId?: string, page = { workouts: [summary], nextCursor: null as string | null }) {
  const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(ok(sessionId ? { workout: detail } : page));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  const view = render(<History client={client} sessionId={sessionId}/>);
  await waitFor(() => expect(screen.queryByLabelText('Loading history')).toBeNull());
  return { fetch, client, view };
}
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); }
it('lists saved program/day names, dates and actual set counts with detail links', async () => {
  const { fetch } = await open();
  const row = screen.getByRole('link', { name: 'View workout: Saved day, 10 Nov 2026' });
  expect(row.getAttribute('href')).toBe(`#history/${id}`);
  expect(within(row).getByText(/Saved strength/)).toBeTruthy(); expect(within(row).getByText('3 sets')).toBeTruthy(); expect(within(row).getByText('60 min')).toBeTruthy();
  expect(fetch.mock.calls[1][0]).toContain('/api/workout-sessions/history');
  expect((fetch.mock.calls[1][1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(screen.queryByText('Build your foundation')).toBeNull();
});
it('shows an empty history with a path to start a workout', async () => {
  await open(undefined, { workouts: [], nextCursor: null });
  expect(screen.getByText('No completed workouts')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Choose a workout' }).getAttribute('href')).toBe('#workout');
});
it('shows performed sets, repeated exercise positions, zero/null weight and saved notes read-only', async () => {
  const { fetch } = await open(id);
  expect(screen.getByRole('heading', { name: 'Saved day' })).toBeTruthy();
  const first = screen.getByRole('region', { name: 'Saved squat, position 2' }), second = screen.getByRole('region', { name: 'Saved squat, position 5' });
  expect(within(first).getByText('9 reps')).toBeTruthy(); expect(within(first).getByText('6 reps')).toBeTruthy(); expect(within(first).getByText('12.35 kg')).toBeTruthy(); expect(within(first).getByText('0 kg')).toBeTruthy();
  expect(within(second).getByText('15 reps')).toBeTruthy(); expect(within(second).getByText('No weight recorded')).toBeTruthy();
  expect(screen.getByText(/Saved note/).textContent).toBe('Saved note\nSecond line');
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(0); expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  expect(fetch.mock.calls[1][0]).toContain(`/history/${id}`); expect(fetch).toHaveBeenCalledTimes(2);
});
it('appends paginated results and retries a page failure without losing loaded rows', async () => {
  const { fetch } = await open(undefined, { workouts: [summary], nextCursor: id });
  fetch.mockRejectedValueOnce(new Error('offline')); click('Load more workouts');
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not connect. Please try again.');
  expect(screen.getByRole('link', { name: 'View workout: Saved day, 10 Nov 2026' })).toBeTruthy();
  fetch.mockResolvedValueOnce(ok({ workouts: [{ ...summary, id: nextId, day: { ...summary.day!, title: 'Earlier day' } }], nextCursor: null })); click('Retry loading more');
  expect(await screen.findByRole('link', { name: 'View workout: Earlier day, 10 Nov 2026' })).toBeTruthy();
  expect(fetch.mock.calls[3][0]).toContain(`?cursor=${id}`);
  expect(screen.queryByRole('button', { name: 'Load more workouts' })).toBeNull();
});
it('preserves loaded pages when returning from details', async () => {
  const { fetch, client, view } = await open(undefined, { workouts: [summary], nextCursor: id });
  fetch.mockResolvedValueOnce(ok({ workouts: [{ ...summary, id: nextId, day: { ...summary.day!, title: 'Earlier day' } }], nextCursor: null })); click('Load more workouts');
  await screen.findByRole('link', { name: 'View workout: Earlier day, 10 Nov 2026' });
  fetch.mockResolvedValueOnce(ok({ workout: detail })); view.rerender(<History client={client} sessionId={id}/>);
  await screen.findByRole('heading', { name: 'Saved day' });
  view.rerender(<History client={client}/>);
  expect(await screen.findByRole('link', { name: 'View workout: Earlier day, 10 Nov 2026' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('recovers a failed initial list request and refreshes completed history', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce({ ok: false, status: 500 }); render(<History client={client}/>);
  expect((await screen.findByRole('alert')).textContent).toContain('Please try again');
  fetch.mockResolvedValueOnce(ok({ workouts: [summary], nextCursor: null })); click('Try again');
  await screen.findByRole('link', { name: 'View workout: Saved day, 10 Nov 2026' });
  fetch.mockResolvedValueOnce(ok({ workouts: [], nextCursor: null })); click('Refresh history');
  expect(await screen.findByText('No completed workouts')).toBeTruthy();
});
it.each([403, 404])('shows detail error %s with a back link and retry', async status => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce({ ok: false, status }); render(<History client={client} sessionId={id}/>);
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'permission' : 'no longer available');
  expect(screen.getByRole('link', { name: '← Back to history' }).getAttribute('href')).toBe('#history');
  expect(screen.queryByText('9 reps')).toBeNull();
  fetch.mockResolvedValueOnce(ok({ workout: detail })); click('Try again'); expect(await screen.findByText('9 reps')).toBeTruthy();
});
it('shows legacy results without inventing names, weight or duration', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce(ok({ workout: { ...detail, program: null, day: null, finishedAt: null, notes: null, snapshotAvailable: false, exercises: detail.exercises.map(entry => ({ ...entry, name: null, muscleGroup: null, equipment: null })) } }));
  render(<History client={client} sessionId={id}/>);
  expect(await screen.findByText('Original program and exercise names are unavailable. Saved results are shown below.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Exercise 2' })).toBeTruthy(); expect(screen.getByText('9 reps')).toBeTruthy(); expect(screen.getByText('Unavailable')).toBeTruthy();
  expect(screen.getByText('No notes added.')).toBeTruthy(); expect(screen.queryByText('Saved squat')).toBeNull();
});
it('prevents duplicate page requests and ignores detail responses after navigation', async () => {
  const { fetch, client, view } = await open(undefined, { workouts: [summary], nextCursor: id });
  let resolve!: (response: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  click('Load more workouts'); click('Loading more…'); expect(fetch).toHaveBeenCalledTimes(3);
  fetch.mockResolvedValueOnce(ok({ workout: detail })); view.rerender(<History client={client} sessionId={id}/>);
  await screen.findByText('9 reps');
  expect((fetch.mock.calls[2][1].signal as AbortSignal).aborted).toBe(true);
  await act(async () => { resolve(ok({ workouts: [{ ...summary, id: nextId }], nextCursor: null })); });
  view.rerender(<History client={client}/>);
  await screen.findByRole('link', { name: 'View workout: Saved day, 10 Nov 2026' });
  expect(screen.getAllByRole('link', { name: /^View workout:/ })).toHaveLength(1);
});
it('aborts in-flight history requests on unmount', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  let resolve!: (response: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const pending = render(<History client={client} sessionId={id}/>);
  const signal = fetch.mock.calls.at(-1)?.[1].signal as AbortSignal; pending.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(ok({ workout: detail })); }); expect(screen.queryByText('9 reps')).toBeNull();
});
it('restores a guarded history detail after a full reload with a fresh client', async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(ok(url.endsWith('/session') ? { accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user } : url.endsWith('/me') ? { user } : { workout: detail })));
  vi.stubGlobal('fetch', fetch); window.history.replaceState(null, '', `#history/${id}`); render(<Root/>);
  expect(await screen.findByText('9 reps')).toBeTruthy();
  expect(window.location.hash).toBe(`#history/${id}`);
  expect(fetch.mock.calls.every(call => !String(call[0]).includes('/api/programs'))).toBe(true);
});
it.each(['unauthenticated', 'ADMIN'])('guards private history links for %s', async role => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(role === 'unauthenticated' ? { ok: false, status: 401 } : ok(url.endsWith('/session') ? { accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { ...user, role } } : { user: { ...user, role } })));
  vi.stubGlobal('fetch', fetch); window.history.replaceState(null, '', `#history/${id}`); render(<Root/>);
  expect(await screen.findByRole('heading', { name: role === 'ADMIN' ? 'Access denied' : 'Welcome back' })).toBeTruthy();
  expect(fetch.mock.calls.some(call => String(call[0]).includes('/workout-sessions/history'))).toBe(false);
});
it('returns to sign in when the history API rejects the session', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce({ ok: false, status: 401 }); render(<History client={client}/>);
  await screen.findByRole('alert'); expect(client.getSession()).toBeNull();
});
