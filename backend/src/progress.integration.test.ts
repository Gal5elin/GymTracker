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
const secret = 'progress-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [], catalog: string[] = [];
let member: string, trainer: string, other: string, admin: string, exerciseId: string, anotherId: string, inactiveId: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@progress.test`, displayName: role, passwordHash: 'not-used', role } }); users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row.id;
}
async function fixture(actor = member, weights: (number | null)[] = [12.35, 18.75, null], complete = true, selected = exerciseId) {
  const program = await prisma.workoutProgram.create({ data: { ownerId: actor, name: 'Progress plan', days: { create: { dayNumber: 1, title: 'Day' } } }, include: { days: true } });
  const day = program.days[0];
  await prisma.programExercise.createMany({ data: [1, 2].map(position => ({ dayId: day.id, exerciseId: selected, position, targetSets: 4, targetReps: 8, targetWeightKg: 9999.99 })) });
  const started = await request(app).post('/api/workout-sessions').set('Authorization', bearer(actor)).send({ programId: program.id, dayId: day.id }); expect(started.status).toBe(201);
  const id = started.body.workout.id;
  for (const [index, weightKg] of weights.entries()) {
    expect((await request(app).post(`/api/workout-sessions/${id}/sets`).set('Authorization', bearer(actor)).send({ exerciseId: selected, exercisePosition: index % 2 + 1, setNumber: Math.floor(index / 2) + 1, reps: 8, weightKg })).status).toBe(201);
  }
  if (complete) expect((await request(app).post(`/api/workout-sessions/${id}/complete`).set('Authorization', bearer(actor)).send({})).status).toBe(200);
  return { id, program, day };
}
const progress = (selected = exerciseId, actor = member) => request(app).get(`/api/progress/${selected}`).set('Authorization', bearer(actor));
const choices = (actor = member) => request(app).get('/api/progress/exercises').set('Authorization', bearer(actor));
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await account('MEMBER'); trainer = await account('TRAINER'); other = await account('MEMBER'); admin = await account('ADMIN');
  for (const [name, isActive] of [['Progress squat', true], ['Progress press', true], ['Historical exercise', false]] as const) {
    const row = await prisma.exercise.create({ data: { name, muscleGroup: 'Test', equipment: 'Barbell', isActive } }); catalog.push(row.id);
    if (name === 'Progress squat') exerciseId = row.id; else if (name === 'Progress press') anotherId = row.id; else inactiveId = row.id;
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
it('returns the maximum actual weight across all occurrences of one exercise per completed workout', async () => {
  const { id } = await fixture(member, [12.35, 18.75, null, 15]);
  const response = await progress();
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.exercise).toMatchObject({ id: exerciseId, name: 'Progress squat' });
  expect(response.body.points).toEqual([expect.objectContaining({ workoutId: id, maxWeightKg: '18.75' })]);
  expect(response.body.points[0].startedAt).toEqual(expect.any(String)); expect(response.body.points[0].finishedAt).toEqual(expect.any(String));
});
it('excludes active workouts, null weights, unselected exercises and another member’s results', async () => {
  const valid = await fixture(member, [10]);
  await fixture(member, [null, null]);
  await fixture(member, [999], true, anotherId);
  await fixture(other, [9999.99]);
  await fixture(member, [888], false);
  expect((await progress()).body.points).toEqual([expect.objectContaining({ workoutId: valid.id, maxWeightKg: '10' })]);
});
it('counts zero as an eligible recorded weight and preserves numeric precision', async () => {
  const zero = await fixture(member, [null, 0]);
  const decimal = await fixture(member, [9.99, 10.01, 10.1]);
  expect((await progress()).body.points.map((point: { workoutId: string; maxWeightKg: string }) => [point.workoutId, point.maxWeightKg])).toEqual([[zero.id, '0'], [decimal.id, '10.1']]);
});
it('returns points chronologically, with separate same-day workouts and deterministic time ties', async () => {
  const later = await fixture(); const first = await fixture(); const second = await fixture();
  await prisma.workoutSession.update({ where: { id: later.id }, data: { startedAt: new Date('2026-11-10T18:00:00Z') } });
  await prisma.workoutSession.updateMany({ where: { id: { in: [first.id, second.id] } }, data: { startedAt: new Date('2026-11-10T08:00:00Z') } });
  const ids = (await progress()).body.points.map((point: { workoutId: string }) => point.workoutId);
  expect(ids).toEqual([...([first.id, second.id].sort()), later.id]);
});
it('returns an empty result for existing exercises with no eligible data', async () => {
  expect((await progress()).body.points).toEqual([]);
  await fixture(member, [null]); expect((await progress()).body.points).toEqual([]);
  expect((await progress(anotherId)).body.points).toEqual([]);
  await fixture(member, [99], false); expect((await progress()).body.points).toEqual([]);
});
it('remains unchanged after plan edits, catalog deactivation or a missing legacy snapshot', async () => {
  const { id, program, day } = await fixture(); const original = (await progress()).body.points;
  await prisma.programExercise.deleteMany({ where: { dayId: day.id } });
  await prisma.workoutProgram.update({ where: { id: program.id }, data: { name: 'Changed plan' } });
  await prisma.workoutSession.update({ where: { id }, data: { planSnapshot: Prisma.DbNull, finishedAt: null } });
  await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Renamed squat', isActive: false } });
  try {
    const response = await progress();
    expect(response.body.points).toEqual(original.map((point: object) => ({ ...point, finishedAt: null })));
    expect(response.body.exercise).toMatchObject({ name: 'Renamed squat', isActive: false });
    expect((await choices()).body.exercises).toContainEqual(expect.objectContaining({ id: exerciseId, isActive: false }));
  } finally { await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Progress squat', isActive: true } }); }
});
it('offers active catalog choices and deactivated exercises only when the actor has completed records', async () => {
  expect((await choices()).body.exercises).toContainEqual(expect.objectContaining({ id: exerciseId, isActive: true }));
  expect((await choices()).body.exercises.some((entry: { id: string }) => entry.id === inactiveId)).toBe(false);
  // Catalog deactivation preserves a completed workout's exercise identity for future selection.
  await prisma.exercise.update({ where: { id: inactiveId }, data: { isActive: true } });
  await fixture(other, [42], true, inactiveId);
  await fixture(member, [null], true, inactiveId);
  await prisma.exercise.update({ where: { id: inactiveId }, data: { isActive: false } });
  expect((await choices()).body.exercises).toContainEqual(expect.objectContaining({ id: inactiveId, isActive: false }));
  expect((await progress(inactiveId)).body.points).toEqual([]);
  expect((await choices(trainer)).body.exercises.some((entry: { id: string }) => entry.id === inactiveId)).toBe(false);
});
it('keeps trainer personal results separate from linked member results', async () => {
  const mine = await fixture(trainer, [20]); await fixture(member, [90]);
  const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  try {
    expect((await progress(exerciseId, trainer)).body.points).toEqual([expect.objectContaining({ workoutId: mine.id, maxWeightKg: '20' })]);
    expect((await request(app).get(`/api/progress/${exerciseId}?memberId=${member}`).set('Authorization', bearer(trainer))).status).toBe(400);
  } finally { await prisma.trainerLink.delete({ where: { id: link.id } }); }
});
it('rejects unauthenticated/admin access, malformed IDs and unsupported query filters', async () => {
  for (const path of ['/api/progress/exercises', `/api/progress/${exerciseId}`]) {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set('Authorization', bearer(admin))).status).toBe(403);
    expect((await request(app).get(path).query({ userId: other }).set('Authorization', bearer(member))).status).toBe(400);
  }
  expect((await progress('invalid')).status).toBe(400);
  expect((await progress(randomUUID())).status).toBe(404);
  expect((await request(app).get(`/api/progress/${exerciseId}`).query({ status: 'IN_PROGRESS' }).set('Authorization', bearer(member))).status).toBe(400);
});
