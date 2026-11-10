// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createAuthClient } from '../api/auth';
import PersonalProgress from './PersonalProgress';
vi.mock('./ProgressChart', () => ({ default: ({ points, exerciseName }: { points: unknown[]; exerciseName: string }) => <div role="img" aria-label={exerciseName}>{JSON.stringify(points)}</div> }));
const squat = { id: 'squat', name: 'Squat', isActive: true }, press = { id: 'press', name: 'Press', isActive: false };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const data = (exercise = squat) => ({ exercise, points: [
  { workoutId: 'one', startedAt: '2026-11-10T10:00:00Z', finishedAt: null, maxWeightKg: '0' },
  { workoutId: 'two', startedAt: '2026-11-10T12:00:00Z', finishedAt: null, maxWeightKg: '12.35' },
] });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function open(response: unknown = data(), choices = [squat, press]) {
  const fetch = vi.fn().mockResolvedValueOnce(ok({ accessToken: 'token', tokenType: 'Bearer', expiresIn: 3600, user: { id: 'member', displayName: 'Member', role: 'MEMBER', isActive: true } })).mockResolvedValueOnce(ok({ exercises: choices })).mockResolvedValueOnce(ok(response));
  vi.stubGlobal('fetch', fetch); const client = createAuthClient(); await client.login('a@b.com', 'password');
  render(<PersonalProgress client={client}/>);
  await waitFor(() => expect(screen.queryByText('Loading exercises…')).toBeNull());
  if (choices.length) await waitFor(() => expect(screen.queryByText('Loading progress…')).toBeNull());
  return fetch;
}
it('loads authenticated real progress, preserves zero/decimals and separate same-day workouts', async () => {
  const fetch = await open();
  expect(screen.getByRole('img', { name: 'Squat' }).textContent).toContain('"weight":0');
  expect(screen.getByText('12.35')).toBeTruthy(); expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe('#history/one');
  expect(fetch.mock.calls[2][0]).toContain('/api/progress/squat');
  expect((fetch.mock.calls[2][1].headers as Headers).get('Authorization')).toBe('Bearer token');
  expect(screen.getByRole('option', { name: 'Press (inactive)' })).toBeTruthy();
});
it('shows clear no-data and empty catalog messages', async () => {
  await open({ exercise: squat, points: [] }); expect(screen.getByText('No progress data')).toBeTruthy();
  cleanup(); await open(undefined, []); expect(screen.getByText('No exercises available')).toBeTruthy();
});
it('hides previous points during selection and ignores late responses', async () => {
  const fetch = await open(); let resolve!: (value: unknown) => void;
  fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.change(screen.getByLabelText('Exercise'), { target: { value: 'press' } });
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByRole('status').textContent).toBe('Loading progress…');
  fetch.mockResolvedValueOnce(ok({ exercise: squat, points: [] }));
  fireEvent.change(screen.getByLabelText('Exercise'), { target: { value: 'squat' } });
  await screen.findByText('No progress data');
  await act(async () => resolve(ok(data(press))));
  expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText('No progress data')).toBeTruthy();
});
it('retries a failed progress request and reports access denial', async () => {
  const fetch = await open(); fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) });
  fireEvent.change(screen.getByLabelText('Exercise'), { target: { value: 'press' } });
  expect((await screen.findByRole('alert')).textContent).toContain('permission'); expect(screen.queryByRole('img')).toBeNull();
  fetch.mockResolvedValueOnce(ok(data(press))); fireEvent.click(screen.getByRole('button', { name: 'Retry loading progress' }));
  expect(await screen.findByRole('img', { name: 'Press' })).toBeTruthy();
});
