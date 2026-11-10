// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import type { ActiveWorkout, WorkoutOption } from '../api/workouts';
import Workout from './Workout';
import Root from '../Root';
const user = { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true };
const planned = { id: 'entry-live', dayId: 'day', exerciseId: 'squat', position: 1, targetSets: 3, targetReps: 8, targetWeightKg: '12.5', exercise: { id: 'squat', name: 'Current squat', muscleGroup: 'Legs', equipment: 'Barbell', isActive: true } };
const own: WorkoutOption = { id: 'program', name: 'Strength', description: 'Three days', source: 'OWNED', assignmentId: null, days: [{ id: 'day', programId: 'program', dayNumber: 3, title: 'Training day', exercises: [planned] }] };
const assigned: WorkoutOption = { ...own, id: 'assigned', name: 'Trainer plan', source: 'ASSIGNED', assignmentId: 'assignment', days: [{ ...own.days[0], programId: 'assigned' }] };
const active: ActiveWorkout = {
  id: 'workout', status: 'IN_PROGRESS', startedAt: '2026-11-10T12:00:00.000Z',
  planSnapshot: { version: 1, program: { id: 'program', name: 'Saved program name', description: null }, day: { id: 'day', dayNumber: 3, title: 'Saved day name' }, exercises: [
    { programExerciseId: 'entry-b', exerciseId: 'squat', position: 5, name: 'Saved squat B', muscleGroup: 'Legs', equipment: 'Barbell', targetSets: 2, targetReps: 12, targetWeightKg: null },
    { programExerciseId: 'entry-a', exerciseId: 'squat', position: 2, name: 'Saved squat A', muscleGroup: 'Legs', equipment: 'Barbell', targetSets: 3, targetReps: 8, targetWeightKg: '0' },
  ] },
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function open(workout: ActiveWorkout | null = null, programs = [own, assigned]) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })).mockResolvedValueOnce(ok({ workout }));
  if (!workout) fetch.mockResolvedValueOnce(ok({ programs }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  const view = render(<Workout client={client}/>);
  await waitFor(() => expect(screen.queryByLabelText('Loading workout')).toBeNull());
  return { fetch, client, view };
}
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); }
it.each([own, assigned])('starts the selected day from $source programs and displays the returned snapshot', async program => {
  const { fetch } = await open(); click(`View program: ${program.name}`);
  expect(screen.getByText(program.source === 'OWNED' ? 'Your program' : 'Assigned to you')).toBeTruthy();
  expect(screen.getByText('Current squat')).toBeTruthy();
  fetch.mockResolvedValueOnce(ok({ workout: active })); click('Start day 3: Training day');
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
  expect(screen.getByText('Saved program name · Day 3')).toBeTruthy();
  expect(screen.queryByText('Current squat')).toBeNull();
  expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ programId: program.id, dayId: 'day', ...(program.assignmentId ? { assignmentId: program.assignmentId } : {}) }) });
  expect((fetch.mock.calls.at(-1)?.[1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(screen.getAllByRole('listitem').map(item => item.querySelector('h2')?.textContent)).toEqual(['Saved squat A', 'Saved squat B']);
  expect(screen.getByText('3 sets × 8 reps · 0 kg')).toBeTruthy();
  expect(screen.getByText('2 sets × 12 reps · No target weight')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save set' })).toBeNull();
});
it('reopens an active workout after a remount without loading the live plan or launch choices', async () => {
  const { fetch, client, view } = await open(active);
  expect(screen.getByRole('heading', { name: 'Saved day name' })).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount(); fetch.mockResolvedValueOnce(ok({ workout: active })); render(<Workout client={client}/>);
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
  expect(fetch.mock.calls.at(-1)?.[0]).toContain('/api/workout-sessions/active');
  expect(fetch.mock.calls.some(call => String(call[0]).endsWith('/options'))).toBe(false);
});
it('handles no programs, no days and empty days without allowing invalid starts', async () => {
  const { fetch, client, view } = await open(null, []);
  expect(screen.getByText('No workout programs yet')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Create a program' }).getAttribute('href')).toBe('#programs');
  view.unmount(); fetch.mockResolvedValueOnce(ok({ workout: null })).mockResolvedValueOnce(ok({ programs: [{ ...own, days: [] }] })); render(<Workout client={client}/>);
  await screen.findByRole('button', { name: 'View program: Strength' }); click('View program: Strength');
  expect(screen.getByText('No training days yet')).toBeTruthy(); cleanup();
  fetch.mockResolvedValueOnce(ok({ workout: null })).mockResolvedValueOnce(ok({ programs: [{ ...own, days: [{ ...own.days[0], exercises: [] }] }] })); render(<Workout client={client}/>);
  await screen.findByRole('button', { name: 'View program: Strength' }); click('View program: Strength');
  expect((screen.getByRole('button', { name: 'Start day 3: Training day' }) as HTMLButtonElement).disabled).toBe(true);
});
it.each([400, 403, 404, 500])('shows useful start errors for %s and keeps the day available for retry', async status => {
  const { fetch } = await open(); click('View program: Strength'); fetch.mockResolvedValueOnce({ ok: false, status }); click('Start day 3: Training day');
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'access' : status === 404 ? 'no longer available' : status === 400 ? 'planned exercises' : 'Please try again');
  expect((screen.getByRole('button', { name: 'Start day 3: Training day' }) as HTMLButtonElement).disabled).toBe(false);
  fetch.mockResolvedValueOnce(ok({ workout: active })); click('Start day 3: Training day');
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
});
it('recovers a workout started in another tab after a conflict', async () => {
  const { fetch } = await open(); click('View program: Strength'); fetch.mockResolvedValueOnce({ ok: false, status: 409 }); click('Start day 3: Training day');
  expect((await screen.findByRole('alert')).textContent).toContain('already active');
  fetch.mockResolvedValueOnce(ok({ workout: active })); click('Open active workout');
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
});
it('retries a failed options load and retains access to active-workout recovery', async () => {
  const { fetch, client, view } = await open(null, []); view.unmount();
  fetch.mockResolvedValueOnce(ok({ workout: null })).mockRejectedValueOnce(new Error('offline')); render(<Workout client={client}/>);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not connect. Please try again.');
  fetch.mockResolvedValueOnce(ok({ workout: active })); click('Try again');
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
});
it('guards duplicate starts and ignores a response after navigation aborts the request', async () => {
  const { fetch, view } = await open(); click('View program: Strength');
  let resolve!: (value: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  click('Start day 3: Training day'); click('Start day 3: Training day');
  expect(fetch).toHaveBeenCalledTimes(4);
  expect((screen.getByRole('button', { name: 'Start day 3: Training day' }) as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[3][1].signal as AbortSignal; view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(ok({ workout: active })); });
  expect(screen.queryByText('Saved day name')).toBeNull();
});
it('does not substitute the live plan for legacy workouts with no snapshot', async () => {
  const { fetch } = await open({ ...active, planSnapshot: null });
  expect(screen.getByText('Saved plan unavailable')).toBeTruthy(); expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Current squat')).toBeNull();
});
it('clears the account if a protected workout request is rejected', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce({ ok: false, status: 401 }); render(<Workout client={client}/>);
  await screen.findByRole('alert'); expect(client.getSession()).toBeNull();
});
it('opens the saved workout through the real workspace and restores it after navigation', async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(ok(url.endsWith('/login') ? { accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user } : url.endsWith('/me') ? { user } : { workout: active })));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  window.history.replaceState(null, '', '#workout'); render(<Root client={client}/>);
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
  act(() => { window.history.replaceState(null, '', '#history'); window.dispatchEvent(new Event('hashchange')); });
  expect(await screen.findByRole('heading', { name: 'History' })).toBeTruthy();
  act(() => { window.history.replaceState(null, '', '#workout'); window.dispatchEvent(new Event('hashchange')); });
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
});

it('restores an active workout after a full reload with a fresh auth client', async () => {
  const fetch = vi.fn().mockImplementation((url: string) => Promise.resolve(ok(url.endsWith('/session')
    ? { accessToken: 'restored-token', tokenType: 'Bearer', expiresIn: 3600, user }
    : url.endsWith('/me') ? { user } : { workout: active })));
  vi.stubGlobal('fetch', fetch); window.history.replaceState(null, '', '#workout');
  render(<Root/>);
  expect(await screen.findByRole('heading', { name: 'Saved day name' })).toBeTruthy();
  expect(fetch.mock.calls[0]).toEqual([expect.stringContaining('/api/auth/session'), expect.objectContaining({ method: 'POST', credentials: 'include' })]);
  expect(fetch.mock.calls.filter(call => call[0].endsWith('/api/workout-sessions') && call[1].method === 'POST')).toHaveLength(0);
});
