// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import type { ActiveWorkout } from '../api/workouts';
import type { PerformedSet } from '../api/workout-sets';
import WorkoutSets from './WorkoutSets';
const user = { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true };
const workout: ActiveWorkout = { id: 'workout', status: 'IN_PROGRESS', startedAt: '2026-11-10T12:00:00Z', planSnapshot: {
  version: 1, program: { id: 'program', name: 'Strength', description: null }, day: { id: 'day', dayNumber: 1, title: 'Day' },
  exercises: [2, 5].map(position => ({ programExerciseId: `entry-${position}`, exerciseId: 'squat', position, name: 'Squat', muscleGroup: 'Legs', equipment: 'Barbell', targetSets: 3, targetReps: 8, targetWeightKg: '10' })),
} };
const saved: PerformedSet = { id: 'saved-1', sessionId: workout.id, exerciseId: 'squat', exercisePosition: 2, setNumber: 1, reps: 9, weightKg: null };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const state = (status = 'IN_PROGRESS') => ok({ workout: { id: workout.id, status } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function open(sets: PerformedSet[] = []) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })).mockResolvedValueOnce(ok({ sets })).mockResolvedValueOnce(state());
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  const view = render(<WorkoutSets client={client} workout={workout}/>);
  await screen.findByRole('button', { name: 'Reload saved sets' });
  return { fetch, client, view };
}
const label = (field: string, position = 2, number = 1) => `${field} for Squat, exercise ${position}, set ${number}`;
function change(field: string, value: string, position = 2, number = 1) { fireEvent.change(screen.getByLabelText(label(field, position, number)), { target: { value } }); }
function save(position = 2, number = 1) { fireEvent.click(screen.getByRole('button', { name: `Save set ${number} of Squat, exercise ${position}` })); }
const input = (field: string, position = 2, number = 1) => screen.getByLabelText(label(field, position, number)) as HTMLInputElement;
it('records actual reps with blank weight, locks the saved row and offers the next set', async () => {
  const { fetch } = await open();
  expect(input('Reps').value).toBe(''); expect(input('Weight in kg').value).toBe('');
  change('Reps', '9'); fetch.mockResolvedValueOnce(ok({ set: saved })); save();
  await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 2 saved' });
  expect(fetch.mock.calls[3][0]).toContain('/api/workout-sessions/workout/sets');
  expect(fetch.mock.calls[3][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ exerciseId: 'squat', exercisePosition: 2, setNumber: 1, reps: 9, weightKg: null }) });
  expect((fetch.mock.calls[3][1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(input('Reps').value).toBe('9'); expect(input('Reps').disabled).toBe(true); expect(input('Weight in kg').value).toBe('');
  expect(input('Reps', 2, 2).value).toBe('');
  expect((screen.getByRole('button', { name: 'Reload saved sets' }) as HTMLButtonElement).disabled).toBe(false);
});
it.each(['0', '12.35', '9999.99'])('records valid actual weight %s without confusing it with targets', async weight => {
  const { fetch } = await open(); change('Reps', '7'); change('Weight in kg', weight);
  fetch.mockResolvedValueOnce(ok({ set: { ...saved, reps: 7, weightKg: weight } })); save();
  await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 2 saved' });
  expect(JSON.parse(fetch.mock.calls[3][1].body)).toMatchObject({ reps: 7, weightKg: Number(weight) });
  expect(input('Weight in kg').value).toBe(weight);
});
it('keeps repeated exercise positions independent and reloads saved performance after remount', async () => {
  const { fetch, client, view } = await open([saved]);
  change('Reps', '11', 5); fetch.mockResolvedValueOnce(ok({ set: { ...saved, id: 'saved-b', exercisePosition: 5, reps: 11, weightKg: '20' } })); save(5);
  await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 5 saved' });
  expect(input('Reps', 2).value).toBe('9'); expect(input('Reps', 5).value).toBe('11');
  view.unmount(); fetch.mockResolvedValueOnce(ok({ sets: [saved, { ...saved, id: 'saved-b', exercisePosition: 5, reps: 11, weightKg: '20' }] })).mockResolvedValueOnce(state());
  render(<WorkoutSets client={client} workout={workout}/>);
  await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 5 saved' });
  expect(input('Reps', 2).value).toBe('9'); expect(input('Reps', 5).value).toBe('11'); expect(input('Weight in kg', 5).value).toBe('20');
});
it('validates reps and weight before making any save requests', async () => {
  const { fetch } = await open();
  for (const value of ['', '0', '-1', '1.5', '2147483648']) {
    change('Reps', value); save(); expect(screen.getByRole('alert').textContent).toContain('positive whole number');
  }
  change('Reps', '8');
  for (const value of ['-1', '10000', '0.001']) {
    change('Weight in kg', value); save(); expect(screen.getByRole('alert').textContent).toContain('at most two decimal places');
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});
it('retains draft input after a network failure and saves on retry', async () => {
  const { fetch } = await open(); change('Reps', '9'); change('Weight in kg', '15.5');
  fetch.mockRejectedValueOnce(new Error('offline')); save();
  expect((await screen.findByRole('alert')).textContent).toContain('Your entries are still here');
  expect(input('Reps').value).toBe('9'); expect(input('Weight in kg').value).toBe('15.5');
  fetch.mockResolvedValueOnce(ok({ set: { ...saved, weightKg: '15.5' } })); save();
  expect(await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 2 saved' })).toBeTruthy();
});
it.each([400, 403, 404, 500])('shows a save error for %s without losing workout context or entered reps', async status => {
  const { fetch } = await open(); change('Reps', '9'); fetch.mockResolvedValueOnce({ ok: false, status }); save();
  expect((await screen.findByRole('alert')).textContent).toContain(status === 403 ? 'permission' : status === 404 ? 'no longer available' : status === 400 ? 'saved workout plan' : 'Please try again');
  expect(screen.getAllByRole('heading', { name: 'Squat' })).toHaveLength(2); expect(input('Reps').value).toBe('9');
});
it('recovers a duplicate from the server without overwriting recorded values', async () => {
  const { fetch } = await open(); change('Reps', '15'); change('Weight in kg', '90');
  fetch.mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(state()); save();
  expect(await screen.findByText('Saved sets reloaded. Existing sets cannot be overwritten.')).toBeTruthy();
  expect(input('Reps').value).toBe('9'); expect(input('Weight in kg').value).toBe(''); expect(input('Reps').disabled).toBe(true);
  expect(fetch.mock.calls.filter(call => call[1].method === 'POST')).toHaveLength(2); // Login and the rejected save.
});
it('detects a completed workout after a conflict and removes new-set controls', async () => {
  const { fetch } = await open([saved]); change('Reps', '8', 2, 2);
  fetch.mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(state('COMPLETED')); save(2, 2);
  expect(await screen.findByText('This workout is complete. Saved sets are read-only.')).toBeTruthy();
  expect(screen.queryAllByRole('button', { name: /^Save set/ })).toHaveLength(0);
  expect(input('Reps').disabled).toBe(true);
});
it('can reload saved sets without losing a different unsaved row’s input', async () => {
  const { fetch } = await open(); change('Reps', '12', 5); change('Weight in kg', '30', 5);
  fetch.mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(state()); fireEvent.click(screen.getByRole('button', { name: 'Reload saved sets' }));
  await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 2 saved' });
  expect(input('Reps', 5).value).toBe('12'); expect(input('Weight in kg', 5).value).toBe('30');
});
it('waits for saved-set recovery before enabling writes and retries a failed load', async () => {
  const { fetch, client, view } = await open(); view.unmount();
  fetch.mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce(state()); render(<WorkoutSets client={client} workout={workout}/>);
  expect((await screen.findByRole('alert')).textContent).toContain('permission');
  expect(screen.queryAllByRole('button', { name: /^Save set/ })).toHaveLength(0);
  fetch.mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(state()); fireEvent.click(screen.getByRole('button', { name: 'Reload saved sets' }));
  expect(await screen.findByRole('button', { name: 'Set 1 of Squat, exercise 2 saved' })).toBeTruthy();
});
it('blocks duplicate clicks and aborts saves on navigation', async () => {
  const { fetch, view } = await open(); change('Reps', '9');
  let resolve!: (response: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); save(); save();
  expect(fetch).toHaveBeenCalledTimes(4); expect(input('Reps', 5).disabled).toBe(true);
  const signal = fetch.mock.calls[3][1].signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(ok({ set: saved })); });
  expect(screen.queryByText('Set saved.')).toBeNull();
});
it('supports extra performed sets without rendering the entire planned target count', async () => {
  const { fetch, client, view } = await open([saved]); view.unmount();
  fetch.mockResolvedValueOnce(ok({ sets: [saved] })).mockResolvedValueOnce(state());
  render(<WorkoutSets client={client} workout={{ ...workout, planSnapshot: { ...workout.planSnapshot!, exercises: [{ ...workout.planSnapshot!.exercises[0], targetSets: 2147483647 }] } }}/>);
  await screen.findByRole('button', { name: 'Save set 2 of Squat, exercise 2' });
  expect(screen.getAllByRole('spinbutton')).toHaveLength(4);
});
