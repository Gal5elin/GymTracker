import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma, type Role } from '@prisma/client';
import { createApp } from './app.js';
import { prisma } from './db.js';
const secret = 'history-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [], catalog: string[] = [];
let member: string, trainer: string, other: string, admin: string, exerciseId: string, unperformedId: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function user(role: Role) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@history.test`, displayName: role, passwordHash: 'not-used', role } }); users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row.id;
}
async function fixture(actor = member, complete = true, owner = actor) {
  const program = await prisma.workoutProgram.create({ data: { ownerId: owner, name: 'Original program', days: { create: { dayNumber: 3, title: 'Original day' } } }, include: { days: true } });
  const day = program.days[0];
  await prisma.programExercise.createMany({ data: [
    { dayId: day.id, exerciseId, position: 2, targetSets: 3, targetReps: 8, targetWeightKg: 50 },
    { dayId: day.id, exerciseId, position: 5, targetSets: 2, targetReps: 12 },
    { dayId: day.id, exerciseId: unperformedId, position: 8, targetSets: 1, targetReps: 6 },
  ] });
  if (owner !== actor) await prisma.programAssignment.create({ data: { programId: program.id, memberId: actor, assignedById: owner } });
  const started = await request(app).post('/api/workout-sessions').set('Authorization', bearer(actor)).send({ programId: program.id, dayId: day.id }); expect(started.status).toBe(201);
  const id = started.body.workout.id;
  for (const values of [{ exercisePosition: 5, setNumber: 2, reps: 15, weightKg: null }, { exercisePosition: 2, setNumber: 2, reps: 6, weightKg: 0 }, { exercisePosition: 2, setNumber: 1, reps: 9, weightKg: 12.35 }]) {
    expect((await request(app).post(`/api/workout-sessions/${id}/sets`).set('Authorization', bearer(actor)).send({ exerciseId, ...values })).status).toBe(201);
  }
  if (complete) expect((await request(app).post(`/api/workout-sessions/${id}/complete`).set('Authorization', bearer(actor)).send({ notes: 'Original note' })).status).toBe(200);
  return { id, program, day };
}
const list = (actor = member, query: object = {}) => request(app).get('/api/workout-sessions/history').set('Authorization', bearer(actor)).query(query);
const detail = (id: string, actor = member) => request(app).get(`/api/workout-sessions/history/${id}`).set('Authorization', bearer(actor));
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await user('MEMBER'); trainer = await user('TRAINER'); other = await user('MEMBER'); admin = await user('ADMIN');
  for (const name of ['Original squat', 'Unperformed exercise']) {
    const row = await prisma.exercise.create({ data: { name, muscleGroup: 'Legs', equipment: 'Barbell' } }); catalog.push(row.id);
    if (name === 'Original squat') exerciseId = row.id; else unperformedId = row.id;
  }
}, 30_000);
afterEach(async () => {
  await prisma.sessionSet.deleteMany({ where: { session: { memberId: { in: users } } } });
  await prisma.workoutSession.deleteMany({ where: { memberId: { in: users } } });
});
afterAll(async () => {
  try {
    await prisma.programAssignment.deleteMany({ where: { memberId: { in: users } } });
    await prisma.programExercise.deleteMany({ where: { day: { program: { ownerId: { in: users } } } } });
    await prisma.programDay.deleteMany({ where: { program: { ownerId: { in: users } } } });
    await prisma.workoutProgram.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.exercise.deleteMany({ where: { id: { in: catalog } } });
  } finally { await prisma.$disconnect(); }
});
it('returns an empty private history when no workouts are complete', async () => {
  expect((await list()).body).toEqual({ workouts: [], nextCursor: null });
});
it('lists only the actor’s completed workouts with frozen labels, dates and actual set counts', async () => {
  const first = await fixture(); const second = await fixture(); const foreign = await fixture(other); const active = await fixture(member, false);
  const response = await list(); expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.workouts.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
  expect(response.body.workouts).not.toContainEqual(expect.objectContaining({ id: foreign.id }));
  expect(response.body.workouts).not.toContainEqual(expect.objectContaining({ id: active.id }));
  expect(response.body.workouts[0]).toMatchObject({ status: 'COMPLETED', snapshotAvailable: true, program: { id: second.program.id, name: 'Original program' }, day: { id: second.day.id, dayNumber: 3, title: 'Original day' }, setCount: 3 });
  expect(response.body.workouts[0].startedAt).toEqual(expect.any(String)); expect(response.body.workouts[0].finishedAt).toEqual(expect.any(String));
});
it('returns performed exercises and ordered sets with actual values rather than targets', async () => {
  const { id } = await fixture(); const response = await detail(id);
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  const workout = response.body.workout;
  expect(workout).toMatchObject({ id, status: 'COMPLETED', notes: 'Original note', snapshotAvailable: true });
  expect(workout.exercises.map((entry: { exercisePosition: number }) => entry.exercisePosition)).toEqual([2, 5]);
  expect(workout.exercises[0]).toMatchObject({ exerciseId, name: 'Original squat', muscleGroup: 'Legs', equipment: 'Barbell', sets: [expect.objectContaining({ setNumber: 1, reps: 9, weightKg: '12.35' }), expect.objectContaining({ setNumber: 2, reps: 6, weightKg: '0' })] });
  expect(workout.exercises[1].sets).toEqual([expect.objectContaining({ setNumber: 2, reps: 15, weightKg: null })]);
  expect(workout.exercises.every((entry: { targetSets?: number }) => entry.targetSets === undefined)).toBe(true);
  expect(workout.exercises.some((entry: { exerciseId: string }) => entry.exerciseId === unperformedId)).toBe(false);
});
it('keeps summary and results identical after program, day and catalog changes', async () => {
  const { id, program, day } = await fixture();
  const original = (await detail(id)).body; const summary = (await list()).body;
  await prisma.workoutProgram.update({ where: { id: program.id }, data: { name: 'Changed program' } });
  await prisma.programDay.update({ where: { id: day.id }, data: { title: 'Changed day', dayNumber: 99 } });
  await prisma.programExercise.deleteMany({ where: { dayId: day.id } });
  await prisma.programExercise.create({ data: { dayId: day.id, exerciseId: unperformedId, position: 1, targetSets: 99, targetReps: 99 } });
  await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Changed squat', equipment: 'Machine', isActive: false } });
  try {
    expect((await detail(id)).body).toEqual(original); expect((await list()).body).toEqual(summary);
  } finally { await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Original squat', equipment: 'Barbell', isActive: true } }); }
});
it('supports deterministic pagination without skipping or repeating equal-date records', async () => {
  const records = await Promise.all([fixture(member), fixture(other), fixture(trainer)]);
  // The member's three completed sessions share a timestamp to exercise the UUID tiebreaker.
  const second = await fixture(); const third = await fixture();
  const ids = [records[0].id, second.id, third.id];
  await prisma.workoutSession.updateMany({ where: { id: { in: ids } }, data: { startedAt: new Date('2026-01-01T12:00:00Z') } });
  const expected = [...ids].sort().reverse(); const seen: string[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < 3; index++) {
    const response = await list(member, { limit: '1', ...(cursor ? { cursor } : {}) });
    expect(response.status).toBe(200); expect(response.body.workouts).toHaveLength(1);
    seen.push(response.body.workouts[0].id); cursor = response.body.nextCursor;
    expect(cursor).toBe(index < 2 ? response.body.workouts[0].id : null);
  }
  expect(seen).toEqual(expected);
});
it('defaults to 20 records per page and supports the maximum page size', async () => {
  for (let index = 0; index < 21; index++) await fixture();
  const first = await list(); expect(first.body.workouts).toHaveLength(20); expect(first.body.nextCursor).toEqual(expect.any(String));
  const last = await list(member, { cursor: first.body.nextCursor }); expect(last.body.workouts).toHaveLength(1); expect(last.body.nextCursor).toBeNull();
  expect((await list(member, { limit: '100' })).body.workouts).toHaveLength(21);
});
it.each([{ limit: '0' }, { limit: '-1' }, { limit: '101' }, { limit: '1.5' }, { limit: 'bad' }, { limit: '' }, { cursor: 'bad' }, { memberId: randomUUID() }, { status: 'IN_PROGRESS' }])('rejects invalid or unsupported list query %j', async query => {
  expect((await list(member, query)).status).toBe(400);
});
it('does not accept another member’s, active or nonexistent cursor', async () => {
  const foreign = await fixture(other), active = await fixture(member, false);
  for (const cursor of [foreign.id, active.id, randomUUID()]) expect((await list(member, { cursor })).status).toBe(400);
});
it('retains legacy actual results without inventing labels from the live plan', async () => {
  const { id } = await fixture();
  for (const planSnapshot of [Prisma.DbNull, { version: 999 }]) {
    await prisma.workoutSession.update({ where: { id }, data: { planSnapshot, finishedAt: null } });
    expect((await list()).body.workouts[0]).toMatchObject({ id, snapshotAvailable: false, program: null, day: null, setCount: 3, finishedAt: null });
    const workout = (await detail(id)).body.workout;
    expect(workout).toMatchObject({ snapshotAvailable: false, program: null, day: null, notes: 'Original note' });
    expect(workout.exercises[0]).toMatchObject({ name: null, muscleGroup: null, equipment: null, sets: [expect.objectContaining({ reps: 9, weightKg: '12.35' }), expect.objectContaining({ reps: 6, weightKg: '0' })] });
  }
});
it('keeps assigned-workout history private to its recipient and preserves it after consent ends', async () => {
  const { id } = await fixture(member, true, trainer);
  const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  try {
    expect((await detail(id, trainer)).status).toBe(403);
    await prisma.trainerLink.update({ where: { id: link.id }, data: { status: 'REVOKED' } });
    expect((await detail(id)).status).toBe(200); expect((await list()).body.workouts.map((row: { id: string }) => row.id)).toEqual([id]);
    expect((await detail(id, trainer)).status).toBe(403);
  } finally { await prisma.trainerLink.delete({ where: { id: link.id } }); }
});
it('allows trainers to read their own history and denies another member or admin', async () => {
  const { id } = await fixture(trainer);
  expect((await list(trainer)).body.workouts.map((row: { id: string }) => row.id)).toEqual([id]);
  expect((await detail(id, trainer)).status).toBe(200);
  for (const actor of [member, other, admin]) expect((await detail(id, actor)).status).toBe(403);
  expect((await list(admin)).status).toBe(403);
});
it('requires login, valid IDs and a completed workout for history detail', async () => {
  const { id } = await fixture(member, false);
  expect((await detail(id)).status).toBe(404);
  expect((await detail('bad')).status).toBe(400); expect((await detail(randomUUID())).status).toBe(404);
  expect((await request(app).get('/api/workout-sessions/history')).status).toBe(401);
  expect((await request(app).get(`/api/workout-sessions/history/${id}`)).status).toBe(401);
});
