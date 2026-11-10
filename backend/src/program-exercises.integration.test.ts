import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { createApp } from './app.js';
import { prisma } from './db.js';
const secret = 'exercise-tests-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [], exercises: string[] = [];
let member: string, trainer: string, other: string, admin: string, active: string, inactive: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role) {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@plan-exercises.test`, displayName: 'Exercise planner', passwordHash: 'not-used', role } });
  users.push(user.id);
  await prisma.authSession.create({ data: { id: user.id, userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return user.id;
}
async function plan(ownerId = member) {
  const program = await prisma.workoutProgram.create({ data: { ownerId, name: 'Plan', days: { create: { dayNumber: 1, title: 'Day' } } }, include: { days: true } });
  const day = program.days[0];
  return { program, day, path: `/api/programs/${program.id}/days/${day.id}/exercises` };
}
const values = (position = 1) => ({ exerciseId: active, position, targetSets: 3, targetReps: 8 });
const add = (path: string, data: object = values(), caller = member) => request(app).post(path).set('Authorization', bearer(caller)).send(data);
const list = (path: string, caller = member) => request(app).get(path).set('Authorization', bearer(caller));
const reorder = (path: string, exerciseIds: string[], caller = member) => request(app).put(`${path}/order`).set('Authorization', bearer(caller)).send({ exerciseIds });
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await account('MEMBER'); trainer = await account('TRAINER'); other = await account('MEMBER'); admin = await account('ADMIN');
  for (const isActive of [true, false]) {
    const exercise = await prisma.exercise.create({ data: { name: `Catalog ${randomUUID()}`, muscleGroup: 'Legs', equipment: 'Barbell', isActive } });
    exercises.push(exercise.id); if (isActive) active = exercise.id; else inactive = exercise.id;
  }
}, 30_000);
afterAll(async () => {
  try {
    await prisma.programExercise.deleteMany({ where: { day: { program: { ownerId: { in: users } } } } });
    await prisma.programDay.deleteMany({ where: { program: { ownerId: { in: users } } } });
    await prisma.workoutProgram.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.exercise.deleteMany({ where: { id: { in: exercises } } });
  } finally { await prisma.$disconnect(); }
});

describe('exercise catalog and planning (US-09)', () => {
  it('serves the active catalog to authenticated users without exposing inactive entries', async () => {
    expect((await request(app).get('/api/exercises')).status).toBe(401);
    for (const caller of [member, trainer, admin]) {
      const response = await request(app).get('/api/exercises').set('Authorization', bearer(caller));
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.exercises).toContainEqual(expect.objectContaining({ id: active, muscleGroup: 'Legs', equipment: 'Barbell' }));
      expect(response.body.exercises.some((item: { id: string }) => item.id === inactive)).toBe(false);
    }
  });
  it.each(['MEMBER', 'TRAINER'])('lets %s persist targets and multiple occurrences of an exercise', async role => {
    const owner = role === 'TRAINER' ? trainer : member;
    const { path, program } = await plan(owner);
    const second = await add(path, { ...values(2), targetWeightKg: 12.35 }, owner);
    const first = await add(path, values(1), owner);
    expect(first.status).toBe(201); expect(second.status).toBe(201);
    expect(first.body.exercise).toMatchObject({ targetSets: 3, targetReps: 8, targetWeightKg: null, exercise: { id: active } });
    expect(second.body.exercise.targetWeightKg).toBe('12.35');
    const result = await list(path, owner);
    expect(result.body.exercises.map((item: { position: number }) => item.position)).toEqual([1, 2]);
    const detail = await request(app).get(`/api/programs/${program.id}`).set('Authorization', bearer(owner));
    expect(detail.body.program.days[0].exercises).toEqual(result.body.exercises);
    expect(await prisma.programExercise.findUnique({ where: { id: second.body.exercise.id } })).toMatchObject({ position: 2, targetSets: 3 });
  });
  it('edits targets, preserves omitted weight and supports zero and null weights', async () => {
    const { path } = await plan();
    const created = await add(path, { ...values(), targetWeightKg: 10 });
    const url = `${path}/${created.body.exercise.id}`;
    let response = await request(app).patch(url).set('Authorization', bearer(member)).send({ targetSets: 4, targetReps: 12 });
    expect(response.status).toBe(200); expect(response.body.exercise).toMatchObject({ targetSets: 4, targetReps: 12, targetWeightKg: '10' });
    for (const targetWeightKg of [0, null]) {
      response = await request(app).patch(url).set('Authorization', bearer(member)).send({ targetWeightKg });
      expect(response.status).toBe(200); expect(response.body.exercise.targetWeightKg).toBe(targetWeightKg === 0 ? '0' : null);
    }
  });
  it.each([
    { targetSets: 0 }, { targetReps: -1 }, { targetSets: 1.5 }, { targetReps: '8' },
    { position: 0 }, { position: 2147483648 }, { targetSets: 2147483648 },
    { targetWeightKg: -0.01 }, { targetWeightKg: 10000 }, { targetWeightKg: 0.001 }, { targetWeightKg: 1e-12 }, { targetWeightKg: '12.5' },
    { exerciseId: 'bad' }, { dayId: randomUUID() }, { ownerId: randomUUID() },
  ])('rejects invalid targets or forged fields %j on create and update', async invalid => {
    const { path } = await plan();
    const row = (await add(path)).body.exercise;
    expect((await add(path, { ...values(2), ...invalid })).status).toBe(400);
    expect((await request(app).patch(`${path}/${row.id}`).set('Authorization', bearer(member)).send(invalid)).status).toBe(400);
    expect((await list(path)).body.exercises).toHaveLength(1);
  });
  it('rejects missing fields, empty edits and inactive or nonexistent catalog entries', async () => {
    const { path } = await plan();
    for (const data of [{}, { exerciseId: active }, { ...values(), exerciseId: inactive }, { ...values(), exerciseId: randomUUID() }]) expect((await add(path, data)).status).toBe(400);
    const row = (await add(path)).body.exercise;
    for (const data of [{}, { exerciseId: inactive }, { exerciseId: randomUUID() }]) expect((await request(app).patch(`${path}/${row.id}`).set('Authorization', bearer(member)).send(data)).status).toBe(400);
  });
  it('rejects conflicting positions on add, edit and concurrent adds without overwriting targets', async () => {
    const { path } = await plan();
    await add(path); const second = (await add(path, values(2))).body.exercise;
    expect((await add(path)).status).toBe(409);
    expect((await request(app).patch(`${path}/${second.id}`).set('Authorization', bearer(member)).send({ position: 1, targetSets: 9 })).status).toBe(409);
    expect(await prisma.programExercise.findUnique({ where: { id: second.id } })).toMatchObject({ position: 2, targetSets: 3 });
    const responses = await Promise.all([add(path, values(3)), add(path, values(3))]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
  });
  it('atomically swaps positions including sparse and maximum integer positions', async () => {
    const { path } = await plan();
    const a = (await add(path, values(1))).body.exercise;
    const b = (await add(path, values(2))).body.exercise;
    const c = (await add(path, values(2147483647))).body.exercise;
    const response = await reorder(path, [c.id, b.id, a.id]);
    expect(response.status).toBe(200);
    expect(response.body.exercises.map((item: { id: string; position: number }) => [item.id, item.position])).toEqual([[c.id, 1], [b.id, 2], [a.id, 3]]);
    expect((await list(path)).body.exercises).toEqual(response.body.exercises);
    const concurrent = await Promise.all([reorder(path, [a.id, b.id, c.id]), reorder(path, [b.id, c.id, a.id])]);
    expect(concurrent.map(response => response.status)).toEqual([200, 200]);
    const finalIds = (await list(path)).body.exercises.map((item: { id: string }) => item.id);
    expect([[a.id, b.id, c.id], [b.id, c.id, a.id]]).toContainEqual(finalIds);
  });
  it('requires an exact permutation of entry IDs and leaves rejected reorders unchanged', async () => {
    const { path } = await plan();
    const a = (await add(path)).body.exercise;
    const b = (await add(path, values(2))).body.exercise;
    const foreignPlan = await plan(); const foreign = (await add(foreignPlan.path)).body.exercise;
    const original = (await list(path)).body.exercises;
    for (const ids of [[], [a.id], [a.id, a.id], [a.id, foreign.id], [a.id, randomUUID()], [active, b.id], [a.id, b.id, foreign.id]]) {
      expect((await reorder(path, ids)).status).toBe(400);
      expect((await list(path)).body.exercises).toEqual(original);
    }
    const empty = await plan(); expect((await reorder(empty.path, [])).status).toBe(200);
  });
  it('serializes reorder against simultaneous additions without losing an exercise', async () => {
    const { path } = await plan();
    const a = (await add(path)).body.exercise;
    const b = (await add(path, values(2))).body.exercise;
    const responses = await Promise.all([reorder(path, [b.id, a.id]), add(path, values(3))]);
    expect(responses[0].status).toBeOneOf([200, 400]); expect(responses[1].status).toBe(201);
    const entries = (await list(path)).body.exercises;
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((item: { position: number }) => item.position)).size).toBe(3);
  });
  it('removes only the specified planned entry and keeps other occurrences intact', async () => {
    const { path } = await plan();
    const a = (await add(path)).body.exercise; const b = (await add(path, values(2))).body.exercise;
    expect((await request(app).delete(`${path}/${a.id}`).set('Authorization', bearer(member))).status).toBe(204);
    expect((await list(path)).body.exercises.map((item: { id: string }) => item.id)).toEqual([b.id]);
    expect((await request(app).delete(`${path}/${a.id}`).set('Authorization', bearer(member))).status).toBe(404);
  });
  it('enforces authentication, roles, ownership and nested parent IDs for every operation', async () => {
    const { path, day } = await plan(); const entry = (await add(path)).body.exercise;
    for (const caller of [null, other, trainer, admin]) {
      const actions = [request(app).get(path), request(app).post(path).send(values(2)), request(app).patch(`${path}/${entry.id}`).send({ targetSets: 4 }), request(app).put(`${path}/order`).send({ exerciseIds: [entry.id] }), request(app).delete(`${path}/${entry.id}`)];
      for (const action of actions) {
        if (caller) action.set('Authorization', bearer(caller));
        expect((await action).status).toBe(caller ? 403 : 401);
      }
    }
    const different = await plan();
    const mismatch = `/api/programs/${different.program.id}/days/${day.id}/exercises`;
    expect((await list(mismatch)).status).toBe(404);
    expect((await request(app).patch(`${different.path}/${entry.id}`).set('Authorization', bearer(member)).send({ targetSets: 5 })).status).toBe(404);
    expect((await request(app).delete(`${different.path}/${entry.id}`).set('Authorization', bearer(member))).status).toBe(404);
    expect((await list(`/api/programs/invalid/days/${day.id}/exercises`)).status).toBe(400);
    expect((await list(`/api/programs/${different.program.id}/days/invalid/exercises`)).status).toBe(400);
    expect((await request(app).patch(`${path}/invalid`).set('Authorization', bearer(member)).send({ targetSets: 5 })).status).toBe(400);
    expect((await list(path)).body.exercises).toHaveLength(1);
  });
});
