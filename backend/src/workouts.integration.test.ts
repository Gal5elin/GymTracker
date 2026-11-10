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
import { workoutPlanSchema } from './workouts.js';
const secret = 'workout-start-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [];
let member: string, trainer: string, other: string, admin: string, exerciseId: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function user(role: Role) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@workout-start.test`, passwordHash: 'not-used', displayName: role, role } });
  users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row.id;
}
async function plan(ownerId = member, empty = false) {
  const program = await prisma.workoutProgram.create({ data: { ownerId, name: 'Original program', description: 'Original description', days: { create: { title: 'Original day', dayNumber: 3 } } }, include: { days: true } });
  const day = program.days[0];
  if (!empty) await prisma.programExercise.createMany({ data: [
    { dayId: day.id, exerciseId, position: 2, targetSets: 3, targetReps: 8, targetWeightKg: 12.35 },
    { dayId: day.id, exerciseId, position: 5, targetSets: 2, targetReps: 12 },
  ] });
  return { program, day };
}
const start = (actor: string, programId: string, dayId: string, assignmentId?: string) => request(app).post('/api/workout-sessions').set('Authorization', bearer(actor)).send({ programId, dayId, ...(assignmentId ? { assignmentId } : {}) });
const read = (actor: string, id: string) => request(app).get(`/api/workout-sessions/${id}`).set('Authorization', bearer(actor));
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await user('MEMBER'); trainer = await user('TRAINER'); other = await user('MEMBER'); admin = await user('ADMIN');
  const exercise = await prisma.exercise.create({ data: { name: 'Original exercise', muscleGroup: 'Legs', equipment: 'Barbell' } }); exerciseId = exercise.id;
}, 30_000);
afterEach(async () => { await prisma.workoutSession.deleteMany({ where: { memberId: { in: users } } }); });
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
it.each(['MEMBER', 'TRAINER'])('starts a %s’s own plan with a self-assignment and a versioned snapshot', async role => {
  const actor = role === 'MEMBER' ? member : trainer;
  const { program, day } = await plan(actor); const before = Date.now();
  const response = await start(actor, program.id, day.id);
  expect(response.status).toBe(201); expect(response.headers['cache-control']).toBe('no-store');
  const workout = response.body.workout;
  expect(workout).toMatchObject({ memberId: actor, programDayId: day.id, status: 'IN_PROGRESS', finishedAt: null });
  expect(new Date(workout.startedAt).getTime()).toBeGreaterThanOrEqual(before);
  expect(response.headers.location).toBe(`/api/workout-sessions/${workout.id}`);
  expect(await prisma.programAssignment.findUnique({ where: { id: workout.assignmentId } })).toMatchObject({ programId: program.id, memberId: actor, assignedById: actor });
  expect(workoutPlanSchema.safeParse(workout.planSnapshot).success).toBe(true);
  expect(workout.planSnapshot).toMatchObject({ version: 1, program: { id: program.id, name: 'Original program' }, day: { id: day.id, title: 'Original day', dayNumber: 3 } });
  expect(workout.planSnapshot.exercises.map((entry: { position: number }) => entry.position)).toEqual([2, 5]);
  expect(workout.planSnapshot.exercises.map((entry: { targetWeightKg: string | null }) => entry.targetWeightKg)).toEqual(['12.35', null]);
  expect(workout.planSnapshot.exercises[0].programExerciseId).not.toBe(workout.planSnapshot.exercises[1].programExerciseId);
  expect((await read(actor, workout.id)).body.workout).toEqual(workout);
});
it('reuses a self-assignment across workouts and returns the same active workout on retries', async () => {
  const { program, day } = await plan();
  const first = (await start(member, program.id, day.id)).body.workout;
  const retry = await start(member, program.id, day.id);
  expect(retry.status).toBe(200); expect(retry.body.workout).toEqual(first);
  await prisma.workoutSession.update({ where: { id: first.id }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  const next = await start(member, program.id, day.id);
  expect(next.status).toBe(201); expect(next.body.workout.assignmentId).toBe(first.assignmentId); expect(next.body.workout.id).not.toBe(first.id);
  expect(await prisma.programAssignment.count({ where: { programId: program.id, memberId: member } })).toBe(1);
});
it('accepts an assigned trainer program and keeps it available after consent is revoked', async () => {
  const { program, day } = await plan(trainer);
  const assignment = await prisma.programAssignment.create({ data: { programId: program.id, memberId: member, assignedById: trainer } });
  const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  await prisma.trainerLink.update({ where: { id: link.id }, data: { status: 'REVOKED' } });
  await prisma.trainerLink.delete({ where: { id: link.id } });
  // Historical assignments belong to the member independently of the trainer’s current read permissions.
  const response = await start(member, program.id, day.id, assignment.id);
  expect(response.status).toBe(201); expect(response.body.workout.assignmentId).toBe(assignment.id);
  expect(await prisma.programAssignment.count({ where: { programId: program.id, memberId: member } })).toBe(1);
});
it('rejects inaccessible programs, mismatched days and forged assignment or owner fields', async () => {
  const own = await plan(), foreign = await plan(trainer), different = await plan();
  const assignment = await prisma.programAssignment.create({ data: { programId: foreign.program.id, memberId: other, assignedById: trainer } });
  expect((await start(member, foreign.program.id, foreign.day.id)).status).toBe(403);
  expect((await start(member, foreign.program.id, foreign.day.id, assignment.id)).status).toBe(403);
  expect((await start(member, own.program.id, own.day.id, assignment.id)).status).toBe(403);
  expect((await start(member, own.program.id, different.day.id)).status).toBe(404);
  expect((await start(member, own.program.id, randomUUID())).status).toBe(404);
  expect((await start(member, randomUUID(), own.day.id)).status).toBe(404);
  for (const extra of [{ memberId: other }, { status: 'COMPLETED' }, { planSnapshot: {} }, { startedAt: new Date().toISOString() }]) {
    expect((await request(app).post('/api/workout-sessions').set('Authorization', bearer(member)).send({ programId: own.program.id, dayId: own.day.id, ...extra })).status).toBe(400);
  }
  expect(await prisma.workoutSession.count({ where: { memberId: member } })).toBe(0);
  expect(await prisma.programAssignment.count({ where: { programId: own.program.id } })).toBe(0);
});
it.each([{}, { programId: 'bad', dayId: randomUUID() }, { programId: randomUUID() }, { programId: randomUUID(), dayId: randomUUID(), assignmentId: 'bad' }])('rejects invalid start input %j', async body => {
  expect((await request(app).post('/api/workout-sessions').set('Authorization', bearer(member)).send(body)).status).toBe(400);
});
it('does not create a workout or self-assignment for an empty plan day', async () => {
  const { program, day } = await plan(member, true);
  expect((await start(member, program.id, day.id)).status).toBe(400);
  expect(await prisma.programAssignment.count({ where: { programId: program.id } })).toBe(0);
  expect(await prisma.workoutSession.count({ where: { memberId: member } })).toBe(0);
});
it('serializes simultaneous starts into one workout and one self-assignment', async () => {
  const { program, day } = await plan();
  const responses = await Promise.all([start(member, program.id, day.id), start(member, program.id, day.id)]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
  expect(responses[0].body.workout.id).toBe(responses[1].body.workout.id);
  expect(await prisma.workoutSession.count({ where: { memberId: member, status: 'IN_PROGRESS' } })).toBe(1);
  expect(await prisma.programAssignment.count({ where: { memberId: member, programId: program.id } })).toBe(1);
  const different = await plan(); expect((await start(member, different.program.id, different.day.id)).status).toBe(409);
  expect(await prisma.programAssignment.count({ where: { programId: different.program.id } })).toBe(0);
});
it('keeps the snapshot after program/day/catalog edits, reordering and exercise removal', async () => {
  const { program, day } = await plan();
  const original = (await start(member, program.id, day.id)).body.workout;
  const rows = await prisma.programExercise.findMany({ where: { dayId: day.id }, orderBy: { position: 'asc' } });
  const base = `/api/programs/${program.id}/days/${day.id}`;
  expect((await request(app).put(`${base}/exercises/order`).set('Authorization', bearer(member)).send({ exerciseIds: rows.map(row => row.id).reverse() })).status).toBe(200);
  expect((await request(app).patch(`${base}/exercises/${rows[0].id}`).set('Authorization', bearer(member)).send({ targetSets: 6, targetWeightKg: 55 })).status).toBe(200);
  expect((await request(app).delete(`${base}/exercises/${rows[1].id}`).set('Authorization', bearer(member))).status).toBe(204);
  await prisma.workoutProgram.update({ where: { id: program.id }, data: { name: 'Changed program', description: null } });
  await prisma.programDay.update({ where: { id: day.id }, data: { title: 'Changed day', dayNumber: 10 } });
  await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Changed exercise', equipment: 'Changed equipment', isActive: false } });
  expect((await read(member, original.id)).body.workout.planSnapshot).toEqual(original.planSnapshot);
  await prisma.workoutSession.update({ where: { id: original.id }, data: { status: 'COMPLETED' } });
  const newer = await start(member, program.id, day.id);
  expect(newer.body.workout.planSnapshot).toMatchObject({ program: { name: 'Changed program' }, day: { title: 'Changed day' }, exercises: [expect.objectContaining({ name: 'Changed exercise', targetSets: 6 })] });
  expect((await read(member, original.id)).body.workout.planSnapshot).toEqual(original.planSnapshot);
  await prisma.exercise.update({ where: { id: exerciseId }, data: { name: 'Original exercise', equipment: 'Barbell', isActive: true } });
});
it('snapshots one complete order when startup races with reorder', async () => {
  const { program, day } = await plan();
  const rows = await prisma.programExercise.findMany({ where: { dayId: day.id }, orderBy: { position: 'asc' } });
  const [started, reordered] = await Promise.all([start(member, program.id, day.id), request(app).put(`/api/programs/${program.id}/days/${day.id}/exercises/order`).set('Authorization', bearer(member)).send({ exerciseIds: rows.map(row => row.id).reverse() })]);
  expect(started.status).toBe(201); expect(reordered.status).toBe(200);
  const snapshot = started.body.workout.planSnapshot.exercises;
  const actual = snapshot.map((entry: { programExerciseId: string; position: number }) => [entry.programExerciseId, entry.position]);
  expect([[[rows[0].id, 2], [rows[1].id, 5]], [[rows[1].id, 1], [rows[0].id, 2]]]).toContainEqual(actual);
});
it('exposes only the actor’s active workout and enforces read/start role guards', async () => {
  const { program, day } = await plan(); const workout = (await start(member, program.id, day.id)).body.workout;
  expect((await request(app).get('/api/workout-sessions/active').set('Authorization', bearer(member))).body.workout.id).toBe(workout.id);
  expect((await request(app).get('/api/workout-sessions/active').set('Authorization', bearer(other))).body.workout).toBeNull();
  for (const actor of [other, trainer, admin]) expect((await read(actor, workout.id)).status).toBe(403);
  expect((await read(member, randomUUID())).status).toBe(404); expect((await read(member, 'bad')).status).toBe(400);
  for (const action of [request(app).post('/api/workout-sessions').send({ programId: program.id, dayId: day.id }), request(app).get(`/api/workout-sessions/${workout.id}`), request(app).get('/api/workout-sessions/active')]) expect((await action).status).toBe(401);
  expect((await start(admin, program.id, day.id)).status).toBe(403);
});

it('lists only owned or assigned launch choices without granting edit access to assigned plans', async () => {
  const own = await plan(); const assigned = await plan(trainer); const hidden = await plan(other);
  const assignment = await prisma.programAssignment.create({ data: { programId: assigned.program.id, memberId: member, assignedById: trainer } });
  await prisma.programAssignment.create({ data: { programId: assigned.program.id, memberId: other, assignedById: trainer } });
  const response = await request(app).get('/api/workout-sessions/options').set('Authorization', bearer(member));
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  const choices = response.body.programs;
  expect(choices).toContainEqual(expect.objectContaining({ id: own.program.id, source: 'OWNED', assignmentId: null }));
  const choice = choices.find((item: { id: string }) => item.id === assigned.program.id);
  expect(choice).toMatchObject({ source: 'ASSIGNED', assignmentId: assignment.id, days: [expect.objectContaining({ id: assigned.day.id })] });
  expect(choice).not.toHaveProperty('assignments'); expect(choice).not.toHaveProperty('ownerId');
  expect(choice.days[0].exercises.map((item: { position: number }) => item.position)).toEqual([2, 5]);
  expect(choices.some((item: { id: string }) => item.id === hidden.program.id)).toBe(false);
  expect((await request(app).patch(`/api/programs/${assigned.program.id}`).set('Authorization', bearer(member)).send({ name: 'No' })).status).toBe(403);
  expect((await request(app).get('/api/workout-sessions/options')).status).toBe(401);
  expect((await request(app).get('/api/workout-sessions/options').set('Authorization', bearer(admin))).status).toBe(403);
});
