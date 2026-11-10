import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { createApp } from './app.js';
import { prisma } from './db.js';
const secret = 'workout-completion-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [];
let member: string, trainer: string, other: string, admin: string, exerciseId: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@workout-completion.test`, displayName: role, passwordHash: 'not-used', role } });
  users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row.id;
}
async function fixture(actor = member, saved = true, sourceOwner = actor) {
  const program = await prisma.workoutProgram.create({ data: { ownerId: sourceOwner, name: 'Completion plan', days: { create: { dayNumber: 1, title: 'Day', exercises: { create: { exerciseId, position: 1, targetSets: 3, targetReps: 8, targetWeightKg: 20 } } } } }, include: { days: true } });
  if (sourceOwner !== actor) await prisma.programAssignment.create({ data: { programId: program.id, memberId: actor, assignedById: sourceOwner } });
  const response = await request(app).post('/api/workout-sessions').set('Authorization', bearer(actor)).send({ programId: program.id, dayId: program.days[0].id });
  expect(response.status).toBe(201);
  if (saved) expect((await add(response.body.workout.id, actor)).status).toBe(201);
  return { workout: response.body.workout, program };
}
const add = (id: string, actor = member, number = 1) => request(app).post(`/api/workout-sessions/${id}/sets`).set('Authorization', bearer(actor)).send({ exerciseId, exercisePosition: 1, setNumber: number, reps: 10 });
const complete = (id: string, data: object = {}, actor = member) => request(app).post(`/api/workout-sessions/${id}/complete`).set('Authorization', bearer(actor)).send(data);
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await account('MEMBER'); trainer = await account('TRAINER'); other = await account('MEMBER'); admin = await account('ADMIN');
  const exercise = await prisma.exercise.create({ data: { name: 'Completion squat', muscleGroup: 'Legs', equipment: 'Barbell' } }); exerciseId = exercise.id;
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
    if (exerciseId) await prisma.exercise.delete({ where: { id: exerciseId } });
  } finally { await prisma.$disconnect(); }
});
it.each(['MEMBER', 'TRAINER'])('completes a %s’s own workout with a saved set, notes and server time', async role => {
  const actor = role === 'TRAINER' ? trainer : member;
  const { workout } = await fixture(actor); const before = Date.now();
  const response = await complete(workout.id, { notes: '  Good session\nStrong finish  ' }, actor);
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.workout).toMatchObject({ id: workout.id, status: 'COMPLETED', memberId: actor, notes: 'Good session\nStrong finish', planSnapshot: workout.planSnapshot, startedAt: workout.startedAt });
  expect(new Date(response.body.workout.finishedAt).getTime()).toBeGreaterThanOrEqual(before);
  expect(new Date(response.body.workout.finishedAt).getTime()).toBeLessThanOrEqual(Date.now());
  expect(await prisma.workoutSession.findUnique({ where: { id: workout.id } })).toMatchObject({ status: 'COMPLETED', notes: 'Good session\nStrong finish' });
  expect(await prisma.sessionSet.count({ where: { sessionId: workout.id } })).toBe(1);
  const active = await request(app).get('/api/workout-sessions/active').set('Authorization', bearer(actor));
  expect(active.body.workout).toBeNull();
  expect((await request(app).get(`/api/workout-sessions/${workout.id}`).set('Authorization', bearer(actor))).body.workout).toEqual(response.body.workout);
});
it.each([{}, { notes: null }, { notes: '' }, { notes: ' \n ' }])('allows optional or blank notes %j', async body => {
  const { workout } = await fixture();
  const response = await complete(workout.id, body);
  expect(response.status).toBe(200); expect(response.body.workout.notes).toBeNull();
});
it('accepts a request without a body and preserves omitted existing notes', async () => {
  const { workout } = await fixture();
  const notes = 'a'.repeat(2000);
  await prisma.workoutSession.update({ where: { id: workout.id }, data: { notes } });
  const response = await request(app).post(`/api/workout-sessions/${workout.id}/complete`).set('Authorization', bearer(member));
  expect(response.status).toBe(200); expect(response.body.workout.notes).toBe(notes);
});
it.each([{ notes: 12 }, { notes: [] }, { notes: 'a'.repeat(2001) }, { status: 'COMPLETED' }, { memberId: randomUUID() }, { finishedAt: new Date().toISOString() }, { sets: [] }, { planSnapshot: {} }])('rejects invalid notes or forged fields %j without changing the session', async body => {
  const { workout } = await fixture();
  expect((await complete(workout.id, body)).status).toBe(400);
  expect(await prisma.workoutSession.findUnique({ where: { id: workout.id } })).toMatchObject({ status: 'IN_PROGRESS', notes: null, finishedAt: null });
});
it('rejects completion without saved sets and leaves the workout active', async () => {
  const { workout } = await fixture(member, false);
  const response = await complete(workout.id, { notes: 'Not saved' });
  expect(response.status).toBe(400); expect(response.body.error).toContain('at least one set');
  expect(await prisma.workoutSession.findUnique({ where: { id: workout.id } })).toMatchObject({ status: 'IN_PROGRESS', notes: null, finishedAt: null });
  expect((await add(workout.id)).status).toBe(201);
  expect((await complete(workout.id)).status).toBe(200);
});
it('rejects repeated completion and later sets without changing notes, time or performance', async () => {
  const { workout } = await fixture();
  const completed = await complete(workout.id, { notes: 'Original note' });
  expect((await complete(workout.id, { notes: 'Overwritten' })).status).toBe(409);
  expect((await add(workout.id, member, 2)).status).toBe(409);
  const stored = await request(app).get(`/api/workout-sessions/${workout.id}`).set('Authorization', bearer(member));
  expect(stored.body.workout).toEqual(completed.body.workout);
  expect(await prisma.sessionSet.count({ where: { sessionId: workout.id } })).toBe(1);
});
it('serializes concurrent completion requests so only one note and completion time are saved', async () => {
  const { workout } = await fixture();
  const responses = await Promise.all([complete(workout.id, { notes: 'First' }), complete(workout.id, { notes: 'Second' })]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
  const winner = responses.find(response => response.status === 200)!;
  const stored = await request(app).get(`/api/workout-sessions/${workout.id}`).set('Authorization', bearer(member));
  expect(stored.body.workout).toEqual(winner.body.workout);
});
it('resolves a set-save/completion race without admitting sets after completion', async () => {
  const { workout } = await fixture();
  const [completed, saved] = await Promise.all([complete(workout.id), add(workout.id, member, 2)]);
  expect(completed.status).toBe(200); expect(saved.status).toBeOneOf([201, 409]);
  expect(await prisma.sessionSet.count({ where: { sessionId: workout.id } })).toBe(saved.status === 201 ? 2 : 1);
  expect((await add(workout.id, member, 3)).status).toBe(409);
});
it('does not complete an empty workout unless a racing first set commits before the completion check', async () => {
  const { workout } = await fixture(member, false);
  const [completed, saved] = await Promise.all([complete(workout.id), add(workout.id)]);
  expect(saved.status).toBe(201); expect(completed.status).toBeOneOf([200, 400]);
  const stored = await prisma.workoutSession.findUniqueOrThrow({ where: { id: workout.id } });
  expect(stored.status).toBe(completed.status === 200 ? 'COMPLETED' : 'IN_PROGRESS');
  expect(await prisma.sessionSet.count({ where: { sessionId: workout.id } })).toBe(1);
});
it('allows the recipient to complete an assigned workout but denies its source-program owner', async () => {
  const { workout } = await fixture(member, true, trainer);
  expect((await complete(workout.id, {}, trainer)).status).toBe(403);
  expect((await complete(workout.id, { notes: 'My workout' })).status).toBe(200);
});
it('enforces authentication, ownership, role and identifier validation', async () => {
  const { workout } = await fixture();
  const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  try {
    for (const actor of [other, trainer, admin]) expect((await complete(workout.id, {}, actor)).status).toBe(403);
  } finally { await prisma.trainerLink.delete({ where: { id: link.id } }); }
  expect((await request(app).post(`/api/workout-sessions/${workout.id}/complete`).send({})).status).toBe(401);
  expect((await complete('bad')).status).toBe(400); expect((await complete(randomUUID())).status).toBe(404);
  expect(await prisma.workoutSession.findUnique({ where: { id: workout.id } })).toMatchObject({ status: 'IN_PROGRESS', notes: null, finishedAt: null });
});

it('accepts a 2000-character submitted note', async () => {
  const { workout } = await fixture(); const notes = 'x'.repeat(2000);
  const response = await complete(workout.id, { notes });
  expect(response.status).toBe(200); expect(response.body.workout.notes).toBe(notes);
});
it('clears an existing note when explicitly supplied as null', async () => {
  const { workout } = await fixture();
  await prisma.workoutSession.update({ where: { id: workout.id }, data: { notes: 'Old note' } });
  const response = await complete(workout.id, { notes: null });
  expect(response.status).toBe(200); expect(response.body.workout.notes).toBeNull();
});
