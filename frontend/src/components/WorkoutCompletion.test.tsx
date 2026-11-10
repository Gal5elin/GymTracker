// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import type { ActiveWorkout, WorkoutRecord } from '../api/workouts';
import WorkoutSets from './WorkoutSets';
import Root from '../Root';
const id = 'a1111111-1111-4111-8111-111111111111';
const user = { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true };
const workout: ActiveWorkout = { id, status: 'IN_PROGRESS', startedAt: '2026-11-10T12:00:00Z', notes: null, planSnapshot: { version: 1, program: { id: 'program', name: 'Strength', description: null }, day: { id: 'day', dayNumber: 1, title: 'Training day' }, exercises: [{ programExerciseId: 'entry', exerciseId: 'squat', position: 2, name: 'Squat', muscleGroup: 'Legs', equipment: 'Barbell', targetSets: 3, targetReps: 8, targetWeightKg: null }] } };
const saved = { id: 'set-1', sessionId: id, exerciseId: 'squat', exercisePosition: 2, setNumber: 1, reps: 9, weightKg: null };
const completed: WorkoutRecord = { ...workout, status: 'COMPLETED', finishedAt: '2026-11-10T13:00:00Z', notes: 'Good session' };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const auth = () => ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function open(sets = [saved]) {
  const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(ok({ sets })).mockResolvedValueOnce(ok({ workout }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  const onFinished = vi.fn(); const view = render(<WorkoutSets client={client} workout={workout} onFinished={onFinished}/>);
  await screen.findByRole('button', { name: 'Reload saved sets' });
  return { fetch, client, view, onFinished };
}
function finish() { fireEvent.click(screen.getByRole('button', { name: 'Finish workout' })); }
function notes(value: string) { fireEvent.change(screen.getByLabelText('Session notes'), { target: { value } }); }
it('finishes with notes, shows server-saved notes/time and locks set entry', async () => {
  const { fetch, onFinished } = await open(); notes('  Good session  ');
  fetch.mockResolvedValueOnce(ok({ workout: completed })).mockResolvedValueOnce(ok({ sets: [saved] })); finish();
  expect(await screen.findByRole('heading', { name: 'Workout complete' })).toBeTruthy();
  expect(fetch.mock.calls[3][0]).toContain(`/api/workout-sessions/${id}/complete`);
  expect(fetch.mock.calls[3][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ notes: 'Good session' }) });
  expect((fetch.mock.calls[3][1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(screen.getByText('Good session')).toBeTruthy();
  expect(screen.getByText(new Date(completed.finishedAt!).toLocaleString()).getAttribute('datetime')).toBe(completed.finishedAt);
  expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Save set/ })).toBeNull();
  expect((screen.getByLabelText('Reps for Squat, exercise 2, set 1') as HTMLInputElement).disabled).toBe(true);
  expect(onFinished).toHaveBeenCalledWith(completed);
});
it.each(['', '  \n '])('supports optional blank notes %j', async draft => {
  const { fetch } = await open(); notes(draft);
  fetch.mockResolvedValueOnce(ok({ workout: { ...completed, notes: null } })).mockResolvedValueOnce(ok({ sets: [saved] })); finish();
  expect(await screen.findByText('No notes added.')).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ notes: null });
});
it('shows an empty-workout error and keeps notes without sending completion', async () => {
  const { fetch } = await open([]); notes('Keep this draft'); finish();
  expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Record at least one set before finishing your workout.');
  expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('Keep this draft');
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('rejects notes longer than the API limit without sending completion', async () => {
  const { fetch } = await open(); notes('a'.repeat(2001)); finish();
  expect(screen.getByRole('alert')).toHaveProperty('textContent', 'Keep notes within 2000 characters.');
  expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([400, 403, 404])('preserves notes and workout context after a completion error %s', async status => {
  const { fetch } = await open(); notes('Keep my notes'); fetch.mockResolvedValueOnce({ ok: false, status }); finish();
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'permission' : status === 404 ? 'no longer available' : 'Save at least one set');
  expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('Keep my notes');
  expect(screen.getByRole('heading', { name: 'Squat' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Finish workout' }) as HTMLButtonElement).disabled).toBe(false);
});
it('recovers a lost completion response from the saved server state without a second POST', async () => {
  const { fetch } = await open(); notes('Good session');
  fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(ok({ workout: completed })); finish();
  expect(await screen.findByText('Workout completion recovered.')).toBeTruthy();
  expect(screen.getByText('Good session')).toBeTruthy();
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(2); // Auth and completion.
});
it('reloads an already completed workout after a conflict and shows the winning notes', async () => {
  const { fetch } = await open(); notes('Unsent note');
  fetch.mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(ok({ workout: { ...completed, notes: 'Saved in another tab' } })); finish();
  expect(await screen.findByText('Saved in another tab')).toBeTruthy();
  expect(screen.queryByLabelText('Session notes')).toBeNull();
});
it('retains notes when recovery confirms the workout is still active, and supports retry', async () => {
  const { fetch } = await open(); notes('Good session');
  fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(ok({ workout })); finish();
  expect((await screen.findByRole('alert')).textContent).toContain('Your notes are still here');
  expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('Good session');
  fetch.mockResolvedValueOnce(ok({ workout: completed })).mockResolvedValueOnce(ok({ sets: [saved] })); finish();
  expect(await screen.findByText('Good session')).toBeTruthy();
});
it('requires a state reload before retrying if completion and recovery both fail', async () => {
  const { fetch } = await open(); notes('Good session');
  fetch.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(ok({ workout })); finish();
  expect((await screen.findByRole('alert')).textContent).toContain('Could not confirm completion');
  expect((screen.getByRole('button', { name: 'Finish workout' }) as HTMLButtonElement).disabled).toBe(true);
  fetch.mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(ok({ workout })); fireEvent.click(screen.getByRole('button', { name: 'Reload saved sets' }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Finish workout' }) as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('Good session');
});
it('prevents duplicate finish requests, disables writes while finishing and aborts on navigation', async () => {
  const { fetch, view, onFinished } = await open(); notes('Good session');
  let resolve!: (response: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); finish();
  fireEvent.click(screen.getByRole('button', { name: 'Finishing…' }));
  expect(fetch).toHaveBeenCalledTimes(4);
  expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Save set 2 of Squat, exercise 2' }) as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[3][1].signal as AbortSignal; view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(ok({ workout: completed })); }); expect(onFinished).not.toHaveBeenCalled();
});
it('waits for a pending set save before offering completion', async () => {
  const { fetch } = await open();
  fireEvent.change(screen.getByLabelText('Reps for Squat, exercise 2, set 2'), { target: { value: '8' } });
  let resolve!: (response: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: 'Save set 2 of Squat, exercise 2' }));
  expect((screen.getByRole('button', { name: 'Finish workout' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { resolve(ok({ set: { ...saved, id: 'set-2', setNumber: 2 } })); });
  expect((screen.getByRole('button', { name: 'Finish workout' }) as HTMLButtonElement).disabled).toBe(false);
});
it('keeps the completed view reloadable and can return to workout choices', async () => {
  let done = false;
  const fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/complete') && init?.method === 'POST') { done = true; return Promise.resolve(ok({ workout: completed })); }
    return Promise.resolve(ok(url.endsWith('/login') || url.endsWith('/session') ? { accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user }
      : url.endsWith('/me') ? { user }
      : url.endsWith('/sets') ? { sets: [saved] }
      : url.endsWith('/active') ? { workout: done ? null : workout }
      : url.endsWith('/options') ? { programs: [] }
      : { workout: done ? completed : workout }));
  });
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  window.history.replaceState(null, '', '#workout'); const view = render(<Root client={client}/>);
  await screen.findByRole('button', { name: 'Finish workout' }); notes('Good session'); finish();
  expect(await screen.findByText('Good session')).toBeTruthy();
  await waitFor(() => expect(window.location.hash).toBe(`#workout/${id}`));
  expect(screen.getByText('Completed', { selector: '.badge' })).toBeTruthy();
  view.unmount(); render(<Root/>);
  expect(await screen.findByText('Good session')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Choose another workout' }));
  expect(await screen.findByText('No workout programs yet')).toBeTruthy(); expect(window.location.hash).toBe('#workout');
});
it('guards completed-workout direct links before accessing their data', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }); vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', `#workout/${id}`); render(<Root/>);
  expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  expect(fetch.mock.calls.every(call => String(call[0]).endsWith('/api/auth/session'))).toBe(true);
});

it.each([403, 404])('shows a safe completed-link error for status %s without requesting its sets', async status => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(url.endsWith('/login') ? auth() : url.endsWith('/me') ? ok({ user }) : { ok: false, status }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  window.history.replaceState(null, '', `#workout/${id}`); render(<Root client={client}/>);
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'access' : 'workout is no longer available');
  expect(fetch.mock.calls.some(call => String(call[0]).endsWith('/sets'))).toBe(false);
});
