// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import type { PlannedExercise, ProgramDay } from '../api/programs';
import ExercisePlanner from './ExercisePlanner';
import Programs from './Programs';
const user = { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true };
const squat = { id: 'squat', name: 'Squat', muscleGroup: 'Legs', equipment: 'Barbell', isActive: true };
const press = { ...squat, id: 'press', name: 'Press', muscleGroup: 'Chest' };
const day: ProgramDay = { id: 'day', programId: 'program', dayNumber: 1, title: 'Full body' };
const first: PlannedExercise = { id: 'entry-a', dayId: day.id, exerciseId: squat.id, exercise: squat, position: 1, targetSets: 3, targetReps: 8, targetWeightKg: null };
const second: PlannedExercise = { ...first, id: 'entry-b', position: 2, exerciseId: press.id, exercise: press, targetWeightKg: '12.50' };
const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function open(entries: PlannedExercise[] = [], catalog = [squat, press]) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })).mockResolvedValueOnce(ok({ exercises: entries })).mockResolvedValueOnce(ok({ exercises: catalog }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password');
  const onChange = vi.fn(), onBack = vi.fn();
  const view = render(<ExercisePlanner client={client} programId="program" day={day} onChange={onChange} onBack={onBack}/>);
  await waitFor(() => expect(screen.queryByLabelText('Loading exercises')).toBeNull());
  return { fetch, onChange, onBack, view, client };
}
function click(name: string) { fireEvent.click(screen.getByRole('button', { name })); }
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function addForm() { click('Add exercise'); change('Exercise', squat.id); }

it('adds a catalog exercise with targets and optional weight through the authenticated API', async () => {
  const { fetch, onChange } = await open();
  expect(screen.getByText('No exercises yet')).toBeTruthy(); addForm();
  expect(screen.getByRole('option', { name: 'Squat · Legs · Barbell' })).toBeTruthy();
  change('Target sets', '4'); change('Target reps', '10');
  fetch.mockResolvedValueOnce(ok({ exercise: { ...first, targetSets: 4, targetReps: 10 } })); click('Save exercise');
  expect(await screen.findByText('4 sets × 10 reps · No target weight')).toBeTruthy();
  expect(fetch.mock.calls.at(-1)?.[0]).toContain('/api/programs/program/days/day/exercises');
  expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ exerciseId: 'squat', targetSets: 4, targetReps: 10, targetWeightKg: null, position: 1 }) });
  expect((fetch.mock.calls.at(-1)?.[1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'entry-a' })]);
});
it('edits targets with decimal and zero weights and allows clearing weight', async () => {
  const { fetch } = await open([first]);
  for (const [value, saved] of [['12.35', '12.35'], ['0', '0'], ['', null]] as const) {
    click('Edit exercise 1: Squat'); change('Target weight (kg, optional)', value);
    fetch.mockResolvedValueOnce(ok({ exercise: { ...first, targetWeightKg: saved } })); click('Save exercise');
    await screen.findByText(saved === null ? '3 sets × 8 reps · No target weight' : `3 sets × 8 reps · ${saved} kg`);
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('/exercises/entry-a');
    expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ targetSets: 3, targetReps: 8, targetWeightKg: value ? Number(value) : null }) });
  }
});
it('keeps repeated occurrences distinct when editing and removing', async () => {
  const duplicate = { ...first, id: 'entry-b', position: 2 };
  const { fetch } = await open([first, duplicate]);
  click('Edit exercise 2: Squat'); change('Target reps', '12');
  fetch.mockResolvedValueOnce(ok({ exercise: { ...duplicate, targetReps: 12 } })); click('Save exercise');
  expect(await screen.findByText('3 sets × 12 reps · No target weight')).toBeTruthy();
  expect(screen.getByText('3 sets × 8 reps · No target weight')).toBeTruthy();
  fetch.mockResolvedValueOnce(ok(undefined, 204)); click('Remove exercise 1: Squat');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove exercise 1: Squat' })).toBeNull());
  expect(screen.getByRole('button', { name: 'Edit exercise 2: Squat' })).toBeTruthy();
  expect(fetch.mock.calls.at(-1)?.[1].method).toBe('DELETE');
  expect(screen.queryByText('Could not connect. Please try again.')).toBeNull();
});
it('persists ordering using entry IDs and keeps the server-confirmed order', async () => {
  const { fetch, onChange } = await open([first, second]);
  expect((screen.getByRole('button', { name: 'Move exercise 1 up' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Move exercise 2 down' }) as HTMLButtonElement).disabled).toBe(true);
  fetch.mockResolvedValueOnce(ok({ exercises: [{ ...second, position: 1 }, { ...first, position: 2 }] })); click('Move exercise 2 up');
  expect(await screen.findByText('Exercise order saved.')).toBeTruthy();
  expect(screen.getAllByRole('listitem').map(item => item.querySelector('h2')?.textContent)).toEqual(['Press', 'Squat']);
  expect(fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ exerciseIds: ['entry-b', 'entry-a'] }) });
  expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ id: 'entry-b', position: 1 }), expect.objectContaining({ id: 'entry-a', position: 2 })]);
});
it('rejects missing selections and invalid sets, reps and weights without sending requests', async () => {
  const { fetch } = await open(); click('Add exercise'); click('Save exercise');
  expect(screen.getByRole('alert').textContent).toContain('Choose an exercise'); change('Exercise', squat.id);
  for (const value of ['0', '-1', '1.5', '2147483648', '']) {
    change('Target sets', value); fireEvent.submit(screen.getByRole('form', { name: 'Exercise targets' }));
    expect(screen.getByRole('alert').textContent).toContain('positive whole numbers');
  }
  change('Target sets', '3'); change('Target reps', '0'); click('Save exercise');
  expect(screen.getByRole('alert').textContent).toContain('positive whole numbers'); change('Target reps', '8');
  for (const value of ['-0.01', '10000', '1.001']) {
    change('Target weight (kg, optional)', value); click('Save exercise');
    expect(screen.getByRole('alert').textContent).toContain('at most two decimal places');
  }
  expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([403, 409, 400, 404, 500])('preserves a failed draft and shows useful feedback for status %s', async status => {
  const { fetch } = await open(); addForm(); change('Target sets', '5');
  fetch.mockResolvedValueOnce({ ok: false, status }); click('Save exercise');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(status === 403 ? 'permission' : status === 409 ? 'position' : status === 404 ? 'no longer available' : status === 400 ? 'check your entries' : 'Please try again');
  expect((screen.getByLabelText('Target sets') as HTMLInputElement).value).toBe('5');
  fetch.mockResolvedValueOnce(ok({ exercise: { ...first, targetSets: 5 } })); click('Save exercise');
  expect(await screen.findByText('5 sets × 8 reps · No target weight')).toBeTruthy();
});
it('keeps order unchanged after a stale-order rejection and refreshes before retrying', async () => {
  const { fetch } = await open([first, second]);
  fetch.mockResolvedValueOnce({ ok: false, status: 400 }); click('Move exercise 2 up'); await screen.findByRole('alert');
  expect(screen.getAllByRole('listitem').map(item => item.querySelector('h2')?.textContent)).toEqual(['Squat', 'Press']);
  fetch.mockResolvedValueOnce(ok({ exercises: [first, second] })).mockResolvedValueOnce(ok({ exercises: [squat, press] })); click('Refresh list');
  await waitFor(() => expect(screen.queryByLabelText('Loading exercises')).toBeNull());
  fetch.mockResolvedValueOnce(ok({ exercises: [{ ...second, position: 1 }, { ...first, position: 2 }] })); click('Move exercise 2 up');
  expect(await screen.findByText('Exercise order saved.')).toBeTruthy();
});
it('allows editing targets of a deactivated existing exercise without reselecting it', async () => {
  const { fetch } = await open([{ ...first, exercise: { ...squat, isActive: false } }], [press]);
  click('Edit exercise 1: Squat');
  expect(screen.getByRole('option', { name: 'Squat (no longer in catalog)' })).toBeTruthy();
  change('Target reps', '10'); fetch.mockResolvedValueOnce(ok({ exercise: { ...first, targetReps: 10 } })); click('Save exercise');
  await screen.findByText('Exercise saved.');
  expect(JSON.parse(fetch.mock.calls.at(-1)?.[1].body)).not.toHaveProperty('exerciseId');
});
it('disables adding for an empty catalog and retries failed catalog loading', async () => {
  const { fetch } = await open([], []);
  expect(screen.getByText('No exercises are currently available in the catalog.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Add exercise' }) as HTMLButtonElement).disabled).toBe(true);
  // Refresh is also available after a network failure on initial loading.
  const client = createAuthClient(); fetch.mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })); await client.login('member@example.com', 'password');
  cleanup(); fetch.mockResolvedValueOnce(ok({ exercises: [] })).mockRejectedValueOnce(new Error('offline'));
  render(<ExercisePlanner client={client} programId="program" day={day} onChange={() => {}} onBack={() => {}}/>);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not connect. Please try again.');
  fetch.mockResolvedValueOnce(ok({ exercises: [] })).mockResolvedValueOnce(ok({ exercises: [squat] })); click('Refresh list');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Add exercise' }) as HTMLButtonElement).disabled).toBe(false));
});
it('prevents duplicate mutations and ignores late responses after navigation', async () => {
  const { fetch, view, onChange } = await open(); addForm();
  let resolve!: (response: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); click('Save exercise');
  fireEvent.submit(screen.getByRole('form', { name: 'Exercise targets' }));
  expect(fetch).toHaveBeenCalledTimes(4);
  const signal = fetch.mock.calls[3][1].signal as AbortSignal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(ok({ exercise: first })); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith([]);
});
it('opens the planner from a program day and updates its count after returning', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user })).mockResolvedValueOnce(ok({ programs: [{ id: 'program', name: 'Strength', description: null }] }));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('member@example.com', 'password'); render(<Programs client={client}/>);
  await screen.findByRole('button', { name: 'View program: Strength' });
  fetch.mockResolvedValueOnce(ok({ program: { id: 'program', name: 'Strength', description: null, days: [day] } })); click('View program: Strength');
  await screen.findByRole('button', { name: 'Plan exercises for day 1: Full body' });
  fetch.mockResolvedValueOnce(ok({ exercises: [] })).mockResolvedValueOnce(ok({ exercises: [squat] })); click('Plan exercises for day 1: Full body');
  await waitFor(() => expect(screen.queryByLabelText('Loading exercises')).toBeNull()); addForm();
  fetch.mockResolvedValueOnce(ok({ exercise: first })); click('Save exercise'); await screen.findByText('Exercise saved.'); click('← Back to program');
  expect(screen.getByText('1 planned exercise')).toBeTruthy();
});

it('retains draft targets while refreshing after a position conflict', async () => {
  const { fetch } = await open(); addForm(); change('Target sets', '6');
  fetch.mockResolvedValueOnce({ ok: false, status: 409 }); click('Save exercise'); await screen.findByRole('alert');
  fetch.mockResolvedValueOnce(ok({ exercises: [first] })).mockResolvedValueOnce(ok({ exercises: [squat, press] })); click('Refresh list');
  await waitFor(() => expect(screen.queryByLabelText('Loading exercises')).toBeNull());
  expect((screen.getByLabelText('Target sets') as HTMLInputElement).value).toBe('6');
  fetch.mockResolvedValueOnce(ok({ exercise: { ...first, id: 'entry-b', position: 2, targetSets: 6 } })); click('Save exercise');
  await screen.findByText('Exercise saved.');
  expect(JSON.parse(fetch.mock.calls.at(-1)?.[1].body)).toMatchObject({ position: 2, targetSets: 6 });
});
it('preserves the current list when removal fails, then retries successfully', async () => {
  const { fetch } = await open([first]); fetch.mockRejectedValueOnce(new Error('offline')); click('Remove exercise 1: Squat');
  await screen.findByRole('alert'); expect(screen.getByRole('heading', { name: 'Squat' })).toBeTruthy();
  fetch.mockResolvedValueOnce(ok(undefined, 204)); click('Remove exercise 1: Squat');
  expect(await screen.findByText('No exercises yet')).toBeTruthy();
});
it('can replace a planned catalog selection and persist the new exercise ID', async () => {
  const { fetch } = await open([first]); click('Edit exercise 1: Squat'); change('Exercise', press.id);
  fetch.mockResolvedValueOnce(ok({ exercise: { ...first, exerciseId: press.id, exercise: press } })); click('Save exercise');
  expect(await screen.findByRole('heading', { name: 'Press' })).toBeTruthy();
  expect(JSON.parse(fetch.mock.calls.at(-1)?.[1].body)).toMatchObject({ exerciseId: press.id });
});
