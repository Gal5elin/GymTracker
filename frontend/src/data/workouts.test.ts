import { describe, expect, it } from 'vitest';
import { createMockWorkoutService, validateSet } from './workouts';

describe('workout prototype flow', () => {
  it('records a session with notes and bodyweight sets, then locks the completed result', async () => {
    const service = createMockWorkoutService({ empty: true });
    const initial = await service.load();
    expect(initial.workouts).toHaveLength(0);
    const workout = await service.start(initial.programs[0].id, initial.programs[0].days[0].id);
    await expect(service.finish(workout.id, '')).rejects.toThrow('at least one set');
    const saved = await service.saveSet(workout.id, workout.day.exercises[0].id, 0, 1, 10, 60);
    expect(saved.sets[0]).toMatchObject({ reps: 10, weight: 60 });
    await expect(service.saveSet(workout.id, workout.day.exercises[0].id, 0, 1, 10, 60)).rejects.toThrow('already been recorded');
    await service.saveSet(workout.id, workout.day.exercises[2].id, 2, 1, 12, null);
    const completed = await service.finish(workout.id, '  Felt strong today.  ');
    expect(completed.status).toBe('COMPLETED');
    expect(completed.finishedAt).not.toBeNull();
    expect(completed.notes).toBe('Felt strong today.');
    expect(completed.sets[1].weight).toBeNull();
    expect((await service.load()).workouts[0]).toEqual(completed);
    await expect(service.saveSet(workout.id, workout.day.exercises[0].id, 0, 2, 10, 60)).rejects.toThrow('already completed');
    await expect(service.finish(workout.id, 'changed')).rejects.toThrow('already completed');
    expect((await createMockWorkoutService({ empty: true }).load()).workouts).toHaveLength(0);
  });
  it('rejects inaccessible days, overlapping sessions and mismatched exercises', async () => {
    const service = createMockWorkoutService();
    await expect(service.start('strength', 'full-a')).rejects.toThrow('could not be found');
    const workout = await service.start('strength', 'push');
    await expect(service.start('strength', 'legs')).rejects.toThrow('current workout');
    await expect(service.saveSet(workout.id, 'deadlift', 0, 1, 10, 60)).rejects.toThrow('Invalid exercise');
    expect((await service.load()).workouts[0].sets).toHaveLength(0);
  });
  it('isolates fixture snapshots from caller mutations', async () => {
    const service = createMockWorkoutService();
    const snapshot = await service.load();
    snapshot.programs[0].days[0].exercises[0].name = 'Changed';
    snapshot.workouts[0].sets[0].reps = 999;
    const again = await service.load();
    expect(again.programs[0].days[0].exercises[0].name).toBe('Bench press');
    expect(again.workouts[0].sets[0].reps).toBe(10);
  });
  it('shares concurrent load failures and supports a successful retry', async () => {
    const service = createMockWorkoutService({ failFirstLoad: true });
    const results = await Promise.allSettled([service.load(), service.load()]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect((await service.load()).programs).toHaveLength(2);
  });
});
describe('set input validation', () => {
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid reps: %s', (reps) => {
    expect(() => validateSet(reps, 20)).toThrow('whole number');
  });
  it.each([-1, NaN, Infinity, 10000])('rejects invalid weights: %s', (weight) => {
    expect(() => validateSet(10, weight)).toThrow('Weight');
  });
  it('allows bodyweight and zero-weight sets', () => {
    expect(() => validateSet(12, null)).not.toThrow();
    expect(() => validateSet(12, 0)).not.toThrow();
  });
});
