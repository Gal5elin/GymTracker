// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import Assignments from './Assignments';
import AssignedPrograms from './AssignedPrograms';
import Root from '../Root';
const program = { id: 'plan', name: 'Strength', description: 'A trainer plan' };
const member = { id: 'member', displayName: 'Alex Member', email: 'member@example.com' };
const options = { programs: [program], members: [member] };
const saved = { id: 'assignment', programId: program.id, memberId: member.id, assignedById: 'trainer', assignedAt: '2026-11-11T12:00:00Z' };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const failed = (status: number) => ({ ok: false, status, json: async () => ({ error: 'failed' }) });
const assigned = { ...program, source: 'ASSIGNED', assignmentId: saved.id, days: [{ id: 'day', dayNumber: 2, title: 'Upper body', exercises: [{ id: 'entry', targetSets: 3, targetReps: 8, targetWeightKg: '0', exercise: { name: 'Bench press' } }] }] };
async function open(data: unknown = options, received = false) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { id: 'trainer', displayName: 'Trainer', role: received ? 'MEMBER' : 'TRAINER', isActive: true } })).mockResolvedValueOnce(ok(data));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('a@b.com', 'password');
  const view = render(received ? <AssignedPrograms client={client}/> : <Assignments client={client}/>);
  await act(async () => {}); return { fetch, client, ...view };
}
function choose() { fireEvent.change(screen.getByLabelText('Program'), { target: { value: program.id } }); fireEvent.change(screen.getByLabelText('Member'), { target: { value: member.id } }); }
function submit() { fireEvent.submit(screen.getByRole('form', { name: 'Assign a program' })); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('loads choices, validates selection and saves an authenticated assignment with feedback', async () => {
  const { fetch } = await open(); expect(screen.getByRole('option', { name: 'Alex Member (member@example.com)' })).toBeTruthy(); submit(); expect(screen.getByRole('alert').textContent).toContain('Choose a program'); expect(fetch).toHaveBeenCalledTimes(2);
  choose(); fetch.mockResolvedValueOnce(ok({ assignment: saved })); submit(); expect((await screen.findByRole('status')).textContent).toContain('Strength is assigned to Alex Member');
  expect(fetch.mock.calls[2][0]).toMatch(/\/api\/assignments$/); expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({ programId: 'plan', memberId: 'member' }); expect((fetch.mock.calls[2][1].headers as Headers).get('Authorization')).toBe('Bearer token');
});
it('shows paths to create a program or invite members when choices are empty', async () => {
  await open({ programs: [], members: [] }); expect(screen.getByRole('link', { name: 'My programs' }).getAttribute('href')).toBe('#programs'); cleanup();
  await open({ programs: [program], members: [] }); expect(screen.getByText('No connected members')).toBeTruthy(); expect(screen.getByRole('link', { name: 'Invite a member' }).getAttribute('href')).toBe('#invitations');
});
it('preserves selections after a revoked-access error and removes stale recipients on refresh', async () => {
  const { fetch } = await open(); choose(); fetch.mockResolvedValueOnce(failed(403)); submit(); expect((await screen.findByRole('alert')).textContent).toContain('accepted your invitation');
  expect((screen.getByLabelText('Program') as HTMLSelectElement).value).toBe(program.id); expect((screen.getByLabelText('Member') as HTMLSelectElement).value).toBe(member.id);
  fetch.mockResolvedValueOnce(ok({ programs: [program], members: [] })); fireEvent.click(screen.getByRole('button', { name: 'Refresh choices' })); expect(await screen.findByText('No connected members')).toBeTruthy();
});
it('allows safe retries after connection failures and prevents repeated pending submissions', async () => {
  const { fetch, unmount } = await open(); choose(); fetch.mockRejectedValueOnce(new Error('offline')); submit(); expect((await screen.findByRole('alert')).textContent).toContain('will not create a duplicate');
  let resolve!: (value: unknown) => void; fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; })); submit(); submit(); expect(fetch).toHaveBeenCalledTimes(4);
  expect((screen.getByRole('button', { name: 'Assigning…' }) as HTMLButtonElement).disabled).toBe(true);
  const signal = fetch.mock.calls[3][1].signal as AbortSignal; unmount(); expect(signal.aborted).toBe(true); await act(async () => resolve(ok({ assignment: saved })));
});
it('retries failed options loading', async () => {
  const { fetch, client, unmount } = await open(); unmount(); fetch.mockResolvedValueOnce(failed(500)); render(<Assignments client={client}/>); expect(await screen.findByRole('alert')).toBeTruthy();
  fetch.mockResolvedValueOnce(ok(options)); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(await screen.findByLabelText('Program')).toBeTruthy();
});
it('shows assigned programs, numbered days and planned targets read-only while excluding owned programs', async () => {
  const { fetch } = await open({ programs: [assigned, { ...assigned, id: 'own', name: 'Own program', source: 'OWNED' }] }, true);
  expect(screen.getByRole('region', { name: 'Assigned program: Strength' })).toBeTruthy(); expect(screen.getByText('Day 2: Upper body')).toBeTruthy(); expect(screen.getByText('Bench press')).toBeTruthy(); expect(screen.getByText(/3 sets × 8 reps at 0 kg/)).toBeTruthy();
  expect(screen.queryByText('Own program')).toBeNull(); expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull(); expect(screen.getByRole('link', { name: 'Choose a workout' }).getAttribute('href')).toBe('#workout');
  expect(fetch.mock.calls[1][0]).toContain('/api/workout-sessions/options');
});
it('handles assigned programs without days and an empty member overview', async () => {
  await open({ programs: [{ ...assigned, days: [] }] }, true); expect(screen.getByText('No training days yet.')).toBeTruthy(); cleanup(); await open({ programs: [] }, true); expect(screen.getByText('No assigned programs yet')).toBeTruthy();
});
it('keeps assigned program data visible after a refresh failure and retries', async () => {
  const { fetch } = await open({ programs: [assigned] }, true); fetch.mockRejectedValueOnce(new Error('offline')); fireEvent.click(screen.getByRole('button', { name: 'Refresh programs' })); expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByText('Strength')).toBeTruthy();
  fetch.mockResolvedValueOnce(ok({ programs: [assigned] })); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); await act(async () => {}); expect(screen.queryByRole('alert')).toBeNull();
});

it.each([false, true])('routes the signed-in assignment tab for member=%s', async received => {
  const { fetch, client, unmount } = await open(received ? { programs: [assigned] } : options, received); unmount();
  fetch.mockResolvedValueOnce(ok({ user: { id: 'trainer', displayName: 'Trainer', role: received ? 'MEMBER' : 'TRAINER', isActive: true } })).mockResolvedValueOnce(ok(received ? { programs: [assigned] } : options));
  window.history.replaceState(null, '', '#assignments'); render(<Root client={client}/>);
  if (received) { expect(await screen.findByRole('region', { name: 'Assigned program: Strength' })).toBeTruthy(); expect(screen.queryByLabelText('Member')).toBeNull(); }
  else expect(await screen.findByRole('form', { name: 'Assign a program' })).toBeTruthy();
});
