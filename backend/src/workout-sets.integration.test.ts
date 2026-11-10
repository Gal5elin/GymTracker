import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma, type Role } from '@prisma/client';
import { createApp } from './app.js';
import { prisma } from './db.js';
const secret = 'performed-sets-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [], catalog: string[] = [];
let member: string, trainer: string, other: string, admin: string, exerciseId: string, differentExercise: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role) {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@performed-sets.test`, displayName: role, passwordHash: 'not-used', role } });
  users.push(user.id);
  await prisma.authSession.create({ data: { id: user.id, userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return user.id;
}
async function workout(owner = member) {
  const program = await prisma.workoutProgram.create({ data: { ownerId: owner, name: 'Set test plan', days: { create: { dayNumber: 1, title: 'Day' } } }, include: { days: true } });
  const day = program.days[0];
  await prisma.programExercise.createMany({ data: [
    { dayId: day.id, exerciseId, position: 2, targetSets: 3, targetReps: 8, targetWeightKg: 10 },
    { dayId: day.id, exerciseId, position: 5, targetSets: 2, targetReps: 12 },
    { dayId: day.id, exerciseId: differentExercise, position: 7, targetSets: 1, targetReps: 6 },
  ] });
  const response = await request(app).post('/api/workout-sessions').set('Authorization', bearer(owner)).send({ programId: program.id, dayId: day.id });
  expect(response.status).toBe(201);
  return { row: response.body.workout, program, day };
}
// Each fixture starts via the real start endpoint, then completes the prior test workout for this actor.
async function fresh(owner = member) {
  await prisma.workoutSession.updateMany({ where: { memberId: owner, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  return workout(owner);
}
const body = () => ({ exerciseId, exercisePosition: 2, setNumber: 1, reps: 9 });
const add = (sessionId: string, data: object = body(), owner = member) => request(app).post(`/api/workout-sessions/${sessionId}/sets`).set('Authorization', bearer(owner)).send(data);
const list = (sessionId: string, owner = member) => request(app).get(`/api/workout-sessions/${sessionId}/sets`).set('Authorization', bearer(owner));
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await account('MEMBER'); trainer = await account('TRAINER'); other = await account('MEMBER'); admin = await account('ADMIN');
  for (const name of ['Squat', 'Press']) {
    const exercise = await prisma.exercise.create({ data: { name, muscleGroup: 'Test', equipment: 'Bodyweight' } });
    catalog.push(exercise.id); if (name === 'Squat') exerciseId = exercise.id; else differentExercise = exercise.id;
  }
}, 30_000);
afterAll(async () => {
  try {
    await prisma.sessionSet.deleteMany({ where: { session: { memberId: { in: users } } } });
    await prisma.workoutSession.deleteMany({ where: { memberId: { in: users } } });
    await prisma.programAssignment.deleteMany({ where: { memberId: { in: users } } });
    await prisma.programExercise.deleteMany({ where: { day: { program: { ownerId: { in: users } } } } });
    await prisma.programDay.deleteMany({ where: { program: { ownerId: { in: users } } } });
    await prisma.workoutProgram.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.exercise.deleteMany({ where: { id: { in: catalog } } });
  } finally { await prisma.$disconnect(); }
});
it.each(['MEMBER', 'TRAINER'])('records a %s’s own actual reps and weight separately from planned targets', async role => {
  const owner = role === 'TRAINER' ? trainer : member;
  const { row } = await fresh(owner);
  const response = await add(row.id, { ...body(), reps: 11, weightKg: 12.35 }, owner);
  expect(response.status).toBe(201); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body.set).toMatchObject({ sessionId: row.id, exerciseId, exercisePosition: 2, setNumber: 1, reps: 11, weightKg: '12.35' });
  expect(response.body.set.createdAt).toEqual(expect.any(String));
  const stored = await prisma.sessionSet.findUnique({ where: { id: response.body.set.id } });
  expect(stored?.weightKg?.toString()).toBe('12.35');
  expect((await prisma.workoutSession.findUnique({ where: { id: row.id } }))?.planSnapshot).toEqual(row.planSnapshot);
  expect((await list(row.id, owner)).body.sets).toEqual([response.body.set]);
});
it('supports omitted, null, zero and maximum weights without substituting planned weight', async () => {
  const { row } = await fresh();
  const weights = [undefined, null, 0, 9999.99];
  for (const [index, weightKg] of weights.entries()) {
    const response = await add(row.id, { ...body(), setNumber: index + 1, ...(weightKg === undefined ? {} : { weightKg }) });
    expect(response.status).toBe(201); expect(response.body.set.weightKg).toBe(weightKg == null ? null : String(weightKg));
  }
  // Actual performance may include more sets or different reps than the plan targeted.
  expect((await add(row.id, { ...body(), setNumber: 10, reps: 1 })).status).toBe(201);
});
it('keeps repeated catalog exercises independent by snapshot position and sorts reloaded sets', async () => {
  const { row } = await fresh();
  for (const [exercisePosition, setNumber] of [[5, 2], [2, 2], [5, 1], [2, 1]]) expect((await add(row.id, { ...body(), exercisePosition, setNumber })).status).toBe(201);
  const response = await list(row.id);
  expect(response.body.sets.map((set: { exercisePosition: number; setNumber: number }) => [set.exercisePosition, set.setNumber])).toEqual([[2, 1], [2, 2], [5, 1], [5, 2]]);
});
it.each([
  { reps: 0 }, { reps: -1 }, { reps: 1.5 }, { reps: '8' }, { reps: null }, { reps: 2147483648 },
  { setNumber: 0 }, { setNumber: 1.5 }, { setNumber: 2147483648 },
  { exercisePosition: 0 }, { exercisePosition: 2147483648 },
  { weightKg: -0.01 }, { weightKg: 10000 }, { weightKg: 0.001 }, { weightKg: 1e-12 }, { weightKg: '12.35' },
  { exerciseId: 'bad' }, { memberId: randomUUID() }, { sessionId: randomUUID() }, { status: 'IN_PROGRESS' }, { createdAt: new Date().toISOString() },
])('rejects invalid performed values and forged fields %j without writing a set', async invalid => {
  const { row } = await fresh();
  const response = await add(row.id, { ...body(), ...invalid });
  expect(response.status).toBe(400); expect(response.body.fields).toBeDefined();
  expect((await list(row.id)).body.sets).toEqual([]);
});
it('requires all identifying values and reps', async () => {
  const { row } = await fresh();
  for (const key of ['exerciseId', 'exercisePosition', 'setNumber', 'reps']) {
    const data: Record<string, unknown> = body(); delete data[key];
    expect((await add(row.id, data)).status).toBe(400);
  }
  expect((await add(row.id, {})).status).toBe(400);
});
it('rejects exercises or positions absent from the snapshot and mismatched exercise-position pairs', async () => {
  const { row } = await fresh();
  for (const invalid of [{ exerciseId: randomUUID() }, { exercisePosition: 1 }, { exerciseId: differentExercise, exercisePosition: 2 }, { exerciseId, exercisePosition: 7 }]) expect((await add(row.id, { ...body(), ...invalid })).status).toBe(400);
  expect((await list(row.id)).body.sets).toEqual([]);
});
it('uses the snapshot after live-plan reordering, removal, additions and catalog deactivation', async () => {
  const { row, program, day } = await fresh();
  await prisma.programExercise.deleteMany({ where: { dayId: day.id } });
  await prisma.programExercise.create({ data: { dayId: day.id, exerciseId: differentExercise, position: 2, targetSets: 4, targetReps: 4 } });
  await prisma.exercise.update({ where: { id: exerciseId }, data: { isActive: false } });
  try {
    expect((await add(row.id)).status).toBe(201);
    expect((await add(row.id, { ...body(), exerciseId: differentExercise, setNumber: 2 })).status).toBe(400);
    expect((await add(row.id, { ...body(), exercisePosition: 5 })).status).toBe(201);
    expect(await prisma.workoutProgram.findUnique({ where: { id: program.id } })).toBeTruthy();
  } finally { await prisma.exercise.update({ where: { id: exerciseId }, data: { isActive: true } }); }
});
it('rejects duplicate set numbers without changing saved performance, including concurrent requests', async () => {
  const { row } = await fresh(); const first = await add(row.id);
  const duplicate = await add(row.id, { ...body(), reps: 99, weightKg: 123 });
  expect(duplicate.status).toBe(409); expect(duplicate.body.fields.setNumber).toBeDefined();
  const concurrent = await Promise.all([add(row.id, { ...body(), setNumber: 2 }), add(row.id, { ...body(), setNumber: 2 })]);
  expect(concurrent.map(response => response.status).sort()).toEqual([201, 409]);
  expect((await list(row.id)).body.sets[0]).toEqual(first.body.set);
  expect(await prisma.sessionSet.count({ where: { sessionId: row.id } })).toBe(2);
});
it('denies new sets for completed workouts while keeping their existing sets readable', async () => {
  const { row } = await fresh(); const saved = await add(row.id);
  await prisma.workoutSession.update({ where: { id: row.id }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  expect((await add(row.id, { ...body(), setNumber: 2 })).status).toBe(409);
  expect((await list(row.id)).body.sets).toEqual([saved.body.set]);
});
it('checks completion after acquiring the same row lock used by finalization', async () => {
  const { row } = await fresh();
  let locked!: () => void, release!: () => void;
  const ready = new Promise<void>(done => { locked = done; });
  const gate = new Promise<void>(done => { release = done; });
  const completion = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM workout_sessions WHERE id = ${row.id}::uuid FOR UPDATE`;
    locked(); await gate;
    await tx.workoutSession.update({ where: { id: row.id }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  });
  await ready;
  const pending = add(row.id).then(response => response);
  release(); await completion;
  expect((await pending).status).toBe(409);
  expect((await list(row.id)).body.sets).toEqual([]);
});
it('refuses writes to legacy or malformed snapshots rather than reading the current program', async () => {
  const { row } = await fresh();
  for (const planSnapshot of [Prisma.DbNull, { version: 999 }, {}]) {
    await prisma.workoutSession.update({ where: { id: row.id }, data: { planSnapshot } });
    expect((await add(row.id)).status).toBe(409);
  }
  expect((await list(row.id)).body.sets).toEqual([]);
});
it('enforces ownership, role, authentication and UUID validation for reads and writes', async () => {
  const { row } = await fresh();
  const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  try {
    for (const actor of [other, trainer, admin]) {
      expect((await add(row.id, body(), actor)).status).toBe(403); expect((await list(row.id, actor)).status).toBe(403);
    }
  } finally { await prisma.trainerLink.delete({ where: { id: link.id } }); }
  expect((await request(app).post(`/api/workout-sessions/${row.id}/sets`).send(body())).status).toBe(401);
  expect((await request(app).get(`/api/workout-sessions/${row.id}/sets`)).status).toBe(401);
  expect((await add('bad')).status).toBe(400); expect((await list('bad')).status).toBe(400);
  expect((await add(randomUUID())).status).toBe(404); expect((await list(randomUUID())).status).toBe(404);
  expect((await list(row.id)).body.sets).toEqual([]);
});

it('lets the recipient record an assigned workout while denying its source-program owner', async () => {
  await prisma.workoutSession.updateMany({ where: { memberId: member, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED', finishedAt: new Date() } });
  const { program, day } = await fresh(trainer);
  const assignment = await prisma.programAssignment.create({ data: { programId: program.id, memberId: member, assignedById: trainer } });
  const started = await request(app).post('/api/workout-sessions').set('Authorization', bearer(member)).send({ programId: program.id, dayId: day.id, assignmentId: assignment.id });
  expect(started.status).toBe(201);
  expect((await add(started.body.workout.id)).status).toBe(201);
  expect((await add(started.body.workout.id, { ...body(), setNumber: 2 }, trainer)).status).toBe(403);
  expect((await list(started.body.workout.id, trainer)).status).toBe(403);
});
