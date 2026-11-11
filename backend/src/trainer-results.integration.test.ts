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
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@trainer-results.test`, displayName: role, passwordHash: 'not-used', role } }); users.push(row.id);
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
    await prisma.trainerLink.deleteMany({ where: { trainerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.exercise.deleteMany({ where: { id: { in: catalog } } });
  } finally { await prisma.$disconnect(); }
});
const base = () => `/api/trainer/members/${member}`;
const read = (path: string, actor = trainer) => request(app).get(path).set('Authorization', bearer(actor));
const paths = (id: string) => [`${base()}/workout-sessions/history`, `${base()}/workout-sessions/history/${id}`, `${base()}/progress/exercises`, `${base()}/progress/${exerciseId}`];
afterEach(async () => { await prisma.trainerLink.deleteMany({ where: { trainerId: { in: users } } }); });
async function accept() {
  return prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
}
it('reads the linked member’s completed history, saved details and maximum weights using the personal response format', async () => {
  await accept(); const first = await fixture(); const second = await fixture();
  await fixture(other); await fixture(trainer); await fixture(member, false);
  for (const [path, personal] of [
    [`${base()}/workout-sessions/history`, '/api/workout-sessions/history'],
    [`${base()}/workout-sessions/history/${first.id}`, `/api/workout-sessions/history/${first.id}`],
    [`${base()}/progress/exercises`, '/api/progress/exercises'],
    [`${base()}/progress/${exerciseId}`, `/api/progress/${exerciseId}`],
  ]) {
    const response = await read(path);
    expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual((await read(personal, member)).body);
  }
  const page = await read(`${base()}/workout-sessions/history?limit=1`);
  expect(page.body.workouts.map((row: { id: string }) => row.id)).toEqual([second.id]);
  expect((await read(`${base()}/workout-sessions/history?limit=1&cursor=${page.body.nextCursor}`)).body.workouts[0].id).toBe(first.id);
  expect((await read(`${base()}/progress/${exerciseId}`)).body.points).toEqual([
    expect.objectContaining({ workoutId: first.id, maxWeightKg: '12.35' }),
    expect.objectContaining({ workoutId: second.id, maxWeightKg: '12.35' }),
  ]);
});
it('returns empty results for an accepted member without completed workouts', async () => {
  await accept();
  expect((await read(`${base()}/workout-sessions/history`)).body).toEqual({ workouts: [], nextCursor: null });
  expect((await read(`${base()}/progress/${exerciseId}`)).body.points).toEqual([]);
});
it('checks consent on every endpoint and immediately denies subsequent requests after revocation', async () => {
  const { id } = await fixture();
  for (const status of [null, 'PENDING', 'REJECTED', 'REVOKED', 'ACCEPTED'] as const) {
    const link = status ? await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status } }) : null;
    for (const path of paths(id)) expect((await read(path)).status).toBe(status === 'ACCEPTED' ? 200 : 403);
    if (link) await prisma.trainerLink.delete({ where: { id: link.id } });
  }
  const link = await accept();
  const page = await read(`${base()}/workout-sessions/history?limit=1`);
  await prisma.trainerLink.update({ where: { id: link.id }, data: { status: 'REVOKED' } });
  for (const path of paths(id)) expect((await read(path)).status).toBe(403);
  expect((await read(`${base()}/workout-sessions/history?cursor=${page.body.workouts[0].id}`)).status).toBe(403);
  expect((await read(`/api/workout-sessions/history/${id}`, member)).status).toBe(200);
});
it('denies anonymous users, members, admins, unrelated trainers and inactive members', async () => {
  await accept(); const { id } = await fixture(); const stranger = await user('TRAINER');
  for (const path of paths(id)) {
    expect((await request(app).get(path)).status).toBe(401);
    for (const actor of [member, other, admin, stranger]) expect((await read(path, actor)).status).toBe(403);
  }
  await prisma.user.update({ where: { id: member }, data: { isActive: false } });
  try { for (const path of paths(id)) expect((await read(path)).status).toBe(403); }
  finally { await prisma.user.update({ where: { id: member }, data: { isActive: true } }); }
});
it('validates IDs, pagination and filters and prevents accessing another member’s or active workout', async () => {
  await accept(); const foreign = await fixture(other); const active = await fixture(member, false);
  for (const suffix of ['?limit=0', '?limit=101', '?cursor=bad', `?cursor=${foreign.id}`, `?cursor=${active.id}`, `?memberId=${other}`]) {
    expect((await read(`${base()}/workout-sessions/history${suffix}`)).status).toBe(400);
  }
  for (const suffix of ['bad', randomUUID(), active.id, foreign.id]) {
    expect((await read(`${base()}/workout-sessions/history/${suffix}`)).status).toBe(suffix === 'bad' ? 400 : suffix === foreign.id ? 403 : 404);
  }
  expect((await read(`${base()}/progress/bad`)).status).toBe(400);
  expect((await read(`${base()}/progress/${randomUUID()}`)).status).toBe(404);
  expect((await read(`${base()}/progress/${exerciseId}?memberId=${other}`)).status).toBe(400);
  expect((await read('/api/trainer/members/bad/progress/exercises')).status).toBe(400);
  expect((await read(`/api/trainer/members/${randomUUID()}/progress/exercises`)).status).toBe(403);
});
it('never grants recording or completion rights over the member’s workouts', async () => {
  await accept(); const { id, program, day } = await fixture(member, false);
  const original = await prisma.workoutSession.findUniqueOrThrow({ where: { id }, include: { sets: true } });
  const values = { exerciseId, exercisePosition: 2, setNumber: 3, reps: 8, weightKg: 40 };
  expect((await request(app).post(`/api/workout-sessions/${id}/sets`).set('Authorization', bearer(trainer)).send(values)).status).toBe(403);
  expect((await request(app).post(`/api/workout-sessions/${id}/complete`).set('Authorization', bearer(trainer)).send({})).status).toBe(403);
  expect((await request(app).post('/api/workout-sessions').set('Authorization', bearer(trainer)).send({ programId: program.id, dayId: day.id, memberId: member })).status).toBe(400);
  for (const suffix of [`/workout-sessions/${id}/sets`, `/workout-sessions/${id}/complete`]) {
    expect((await request(app).post(`${base()}${suffix}`).set('Authorization', bearer(trainer)).send(values)).status).toBe(404);
  }
  expect(await prisma.workoutSession.findUniqueOrThrow({ where: { id }, include: { sets: true } })).toEqual(original);
});
