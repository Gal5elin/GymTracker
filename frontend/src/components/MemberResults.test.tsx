// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError, type AuthClient } from '../api/auth';
import MemberResults from './MemberResults';
vi.mock('./ProgressChart', () => ({ default: () => <div role="img" aria-label="Member chart"/> }));
const member = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Alex', email: 'alex@test.com' };
const other = { id: '22222222-2222-4222-8222-222222222222', displayName: 'Sam', email: 'sam@test.com' };
const workout = { id: 'workout', status: 'COMPLETED', startedAt: '2026-11-10T10:00:00Z', finishedAt: null, snapshotAvailable: true, day: { title: 'Member leg day' }, program: { name: 'Member plan' }, setCount: 1 };
const detail = { ...workout, notes: 'Saved member notes', exercises: [{ exerciseId: 'squat', exercisePosition: 1, name: 'Squat', sets: [{ id: 'set', setNumber: 1, reps: 8, weightKg: '12.35' }] }] };
const exercise = { id: 'squat', name: 'Squat', isActive: true };
const response = (data: unknown) => ({ json: async () => data }) as Response;
function setup() {
  const request = vi.fn(async (path: string) => {
    if (path === '/api/assignments/options') return response({ programs: [], members: [member, other] });
    if (path.endsWith('/history/workout')) return response({ workout: detail });
    if (path.includes('/history?cursor=')) return response({ workouts: [{ ...workout, id: 'older', day: { title: 'Older session' } }], nextCursor: null });
    if (path.endsWith('/history')) return response({ workouts: [workout], nextCursor: 'workout' });
    if (path.endsWith('/progress/exercises')) return response({ exercises: [exercise] });
    if (path.endsWith('/progress/squat')) return response({ exercise, points: [{ workoutId: 'workout', startedAt: workout.startedAt, maxWeightKg: '12.35' }] });
    throw new Error(`Unexpected path: ${path}`);
  });
  const client = { request } as unknown as AuthClient;
  return { request, client };
}
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('selects accepted members and loads read-only paginated history on member-scoped endpoints', async () => {
  const { client, request } = setup(); const ui = render(<MemberResults client={client} hash="#members"/>);
  await screen.findByRole('option', { name: 'Alex (alex@test.com)' });
  expect(screen.queryByRole('heading', { name: 'History' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Member'), { target: { value: member.id } });
  expect(window.location.hash).toBe(`#members/${member.id}/history`);
  ui.rerender(<MemberResults client={client} hash={window.location.hash}/>);
  await screen.findByText('Member leg day');
  expect(screen.queryByRole('link', { name: 'Start workout' })).toBeNull();
  expect(screen.getByRole('link', { name: /Member leg day/ }).getAttribute('href')).toBe(`#members/${member.id}/history/workout`);
  fireEvent.click(screen.getByRole('button', { name: 'Load more workouts' }));
  await screen.findByText('Older session');
  expect(request.mock.calls.some(([path]) => path === `/api/trainer/members/${member.id}/workout-sessions/history?cursor=workout`)).toBe(true);
});
it('shows saved-set detail and member progress with links back to the member’s history', async () => {
  const { client } = setup(); const ui = render(<MemberResults client={client} hash={`#members/${member.id}/history/workout`}/>);
  await screen.findByText('Saved member notes'); expect(screen.getByText('12.35 kg')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /complete|save|record/i })).toBeNull();
  expect(screen.getByRole('link', { name: /Back to history/ }).getAttribute('href')).toBe(`#members/${member.id}/history`);
  ui.rerender(<MemberResults client={client} hash={`#members/${member.id}/progress`}/>);
  await screen.findByRole('img', { name: 'Member chart' });
  expect(screen.getByText('12.35')).toBeTruthy();
  expect(screen.getByRole('link', { name: /10\/11\/2026/ }).getAttribute('href')).toBe(`#members/${member.id}/history/workout`);
});
it('removes all displayed results when a later request returns forbidden', async () => {
  const { client, request } = setup(); render(<MemberResults client={client} hash={`#members/${member.id}/history`}/>);
  await screen.findByText('Member leg day');
  request.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
  fireEvent.click(screen.getByRole('button', { name: 'Load more workouts' }));
  expect((await screen.findByRole('alert')).textContent).toContain('no longer available');
  expect(screen.queryByText('Member leg day')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more workouts' })).toBeNull();
});
it('revalidates on focus and clears results when a member is no longer accepted', async () => {
  const { client, request } = setup(); render(<MemberResults client={client} hash={`#members/${member.id}/history`}/>);
  await screen.findByText('Member leg day');
  request.mockResolvedValueOnce(response({ programs: [], members: [other] }));
  fireEvent(window, new Event('focus'));
  await screen.findByRole('alert'); expect(screen.queryByText('Member leg day')).toBeNull();
});
it('ignores a late response after switching members', async () => {
  const { client, request } = setup(); let resolve!: (value: Response) => void;
  request.mockImplementationOnce(async () => response({ programs: [], members: [member, other] })).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const ui = render(<MemberResults client={client} hash={`#members/${member.id}/history`}/>);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  ui.rerender(<MemberResults client={client} hash={`#members/${other.id}/history`}/>);
  await screen.findByText('Viewing Sam · Read-only');
  await act(async () => resolve(response({ workouts: [{ ...workout, day: { title: 'Stale results' } }], nextCursor: null })));
  expect(screen.queryByText('Stale results')).toBeNull();
});
it('handles empty accepted-member choices, loading failure and retry', async () => {
  const { client, request } = setup(); request.mockRejectedValueOnce(new Error('Offline'));
  render(<MemberResults client={client} hash="#members"/>);
  expect((await screen.findByRole('alert')).textContent).toBe('Could not load accepted members. Please try again.');
  request.mockResolvedValueOnce(response({ programs: [], members: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh members' }));
  await screen.findByText('No accepted members');
});
