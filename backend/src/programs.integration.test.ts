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

const secret = 'programs-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [];
let member: string, trainer: string, other: string, admin: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function user(role: Role) {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@programs.test`, displayName: 'Programs test', passwordHash: 'not-used', role } });
  users.push(user.id);
  await prisma.authSession.create({ data: { id: user.id, userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return user.id;
}
const create = (owner: string, data: object = { name: 'Strength', description: 'Three days' }) => request(app).post('/api/programs').set('Authorization', bearer(owner)).send(data);
const addDay = (owner: string, programId: string, data: object) => request(app).post(`/api/programs/${programId}/days`).set('Authorization', bearer(owner)).send(data);
const get = (owner: string, programId: string) => request(app).get(`/api/programs/${programId}`).set('Authorization', bearer(owner));
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await user('MEMBER'); trainer = await user('TRAINER'); other = await user('MEMBER'); admin = await user('ADMIN');
}, 30_000);
afterAll(async () => {
  try {
    await prisma.programDay.deleteMany({ where: { program: { ownerId: { in: users } } } });
    await prisma.workoutProgram.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  } finally { await prisma.$disconnect(); }
});

describe('owned programs and ordered days (US-08)', () => {
  it.each(['MEMBER', 'TRAINER'] as const)('lets %s create, retrieve and update their own persisted program', async role => {
    const owner = role === 'MEMBER' ? member : trainer;
    const response = await create(owner, { name: '  Strength  ', description: '  Three days  ' });
    expect(response.status).toBe(201);
    expect(response.body.program).toMatchObject({ ownerId: owner, name: 'Strength', description: 'Three days' });
    expect(response.headers.location).toBe(`/api/programs/${response.body.program.id}`);
    expect(response.headers['cache-control']).toBe('no-store');
    const id = response.body.program.id;
    expect(await prisma.workoutProgram.findUnique({ where: { id } })).toMatchObject({ ownerId: owner, name: 'Strength' });
    expect((await get(owner, id)).body.program).toMatchObject({ ...response.body.program, days: [] });
    const updated = await request(app).patch(`/api/programs/${id}`).set('Authorization', bearer(owner)).send({ name: ' Updated ' });
    expect(updated.status).toBe(200);
    expect(updated.body.program).toMatchObject({ name: 'Updated', description: 'Three days', ownerId: owner });
    const cleared = await request(app).patch(`/api/programs/${id}`).set('Authorization', bearer(owner)).send({ description: null });
    expect(cleared.body.program).toMatchObject({ name: 'Updated', description: null });
  });
  it('allows absent or blank descriptions and lists only the current owner’s programs', async () => {
    const first = await create(other, { name: 'Own' });
    const second = await create(other, { name: 'Own', description: '   ' });
    expect(first.body.program.description).toBeNull(); expect(second.body.program.description).toBeNull();
    const list = await request(app).get('/api/programs').set('Authorization', bearer(other));
    expect(list.status).toBe(200);
    expect(list.body.programs.map((p: { id: string }) => p.id).sort()).toEqual([first.body.program.id, second.body.program.id].sort());
    expect(list.body.programs.every((p: { ownerId: string }) => p.ownerId === other)).toBe(true);
  });
  it.each([{}, { name: '' }, { name: '  ' }, { name: 12 }, { name: 'a'.repeat(201) }, { name: 'Valid', description: 12 }, { name: 'Valid', description: 'a'.repeat(5001) }, { name: 'Valid', ownerId: randomUUID() }, { name: 'Valid', owner_id: randomUUID() }, { name: 'Valid', days: [] }])('rejects malformed or forged program input %j', async body => {
    const before = await prisma.workoutProgram.count({ where: { ownerId: member } });
    expect((await create(member, body)).status).toBe(400);
    expect(await prisma.workoutProgram.count({ where: { ownerId: member } })).toBe(before);
  });
  it('adds multiple days, sorts numerically and lets the owner rename and renumber them', async () => {
    const program = (await create(member)).body.program;
    const later = await addDay(member, program.id, { dayNumber: 10, title: ' Lower ' });
    const earlier = await addDay(member, program.id, { dayNumber: 2, title: 'Upper' });
    expect(later.status).toBe(201); expect(earlier.status).toBe(201);
    expect(later.body.day).toMatchObject({ title: 'Lower', dayNumber: 10, programId: program.id });
    expect((await get(member, program.id)).body.program.days.map((d: { dayNumber: number }) => d.dayNumber)).toEqual([2, 10]);
    const updated = await request(app).patch(`/api/programs/${program.id}/days/${later.body.day.id}`).set('Authorization', bearer(member)).send({ dayNumber: 1, title: 'Full body' });
    expect(updated.status).toBe(200);
    expect((await get(member, program.id)).body.program.days.map((d: { dayNumber: number }) => d.dayNumber)).toEqual([1, 2]);
    expect(await prisma.programDay.findUnique({ where: { id: later.body.day.id } })).toMatchObject({ title: 'Full body', dayNumber: 1 });
  });
  it('rejects duplicate day numbers on creation, update and concurrent requests, but permits reuse in another program', async () => {
    const program = (await create(trainer)).body.program;
    const first = await addDay(trainer, program.id, { dayNumber: 1, title: 'First' });
    const second = await addDay(trainer, program.id, { dayNumber: 2, title: 'Second' });
    const duplicate = await addDay(trainer, program.id, { dayNumber: 1, title: 'Duplicate' });
    expect(duplicate.status).toBe(409); expect(duplicate.body.fields.dayNumber).toBeDefined();
    expect((await request(app).patch(`/api/programs/${program.id}/days/${second.body.day.id}`).set('Authorization', bearer(trainer)).send({ dayNumber: 1 })).status).toBe(409);
    expect(await prisma.programDay.findUnique({ where: { id: second.body.day.id } })).toMatchObject({ title: 'Second', dayNumber: 2 });
    expect((await request(app).patch(`/api/programs/${program.id}/days/${first.body.day.id}`).set('Authorization', bearer(trainer)).send({ dayNumber: 1 })).status).toBe(200);
    const concurrent = await Promise.all([addDay(trainer, program.id, { dayNumber: 3, title: 'A' }), addDay(trainer, program.id, { dayNumber: 3, title: 'B' })]);
    expect(concurrent.map(r => r.status).sort()).toEqual([201, 409]);
    const different = (await create(trainer)).body.program;
    expect((await addDay(trainer, different.id, { dayNumber: 1, title: 'First' })).status).toBe(201);
  });
  it.each([{}, { dayNumber: 1 }, { title: 'Day' }, { dayNumber: 0, title: 'Day' }, { dayNumber: -1, title: 'Day' }, { dayNumber: 1.5, title: 'Day' }, { dayNumber: '1', title: 'Day' }, { dayNumber: 2147483648, title: 'Day' }, { dayNumber: 1, title: '  ' }, { dayNumber: 1, title: 'a'.repeat(101) }, { dayNumber: 1, title: 'Day', programId: randomUUID() }])('rejects invalid day input %j', async body => {
    const program = (await create(member)).body.program;
    expect((await addDay(member, program.id, body)).status).toBe(400);
    expect((await get(member, program.id)).body.program.days).toEqual([]);
  });
  it('denies non-owner reads and changes, including trainer links and forged ownership', async () => {
    const program = (await create(member)).body.program;
    const day = (await addDay(member, program.id, { dayNumber: 1, title: 'Day' })).body.day;
    const link = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
    try {
      for (const caller of [other, trainer, admin]) {
        expect((await get(caller, program.id)).status).toBe(403);
        expect((await request(app).patch(`/api/programs/${program.id}`).set('Authorization', bearer(caller)).send({ name: 'Changed', ownerId: caller })).status).toBe(403);
        expect((await addDay(caller, program.id, { dayNumber: 2, title: 'Changed' })).status).toBe(403);
        expect((await request(app).patch(`/api/programs/${program.id}/days/${day.id}`).set('Authorization', bearer(caller)).send({ title: 'Changed' })).status).toBe(403);
      }
      expect((await get(member, program.id)).body.program).toMatchObject({ name: 'Strength', days: [expect.objectContaining({ title: 'Day' })] });
    } finally { await prisma.trainerLink.delete({ where: { id: link.id } }); }
  });
  it('rejects empty updates, ownership changes and invalid identifiers, and keeps days bound to their parent', async () => {
    const program = (await create(member)).body.program;
    const different = (await create(member)).body.program;
    const day = (await addDay(member, program.id, { dayNumber: 1, title: 'Day' })).body.day;
    for (const data of [{}, { name: ' ' }, { ownerId: other }, { description: 12 }]) {
      expect((await request(app).patch(`/api/programs/${program.id}`).set('Authorization', bearer(member)).send(data)).status).toBe(400);
    }
    for (const data of [{}, { title: '' }, { dayNumber: 0 }, { programId: different.id }]) {
      expect((await request(app).patch(`/api/programs/${program.id}/days/${day.id}`).set('Authorization', bearer(member)).send(data)).status).toBe(400);
    }
    expect((await get(member, 'invalid')).status).toBe(400);
    expect((await get(member, randomUUID())).status).toBe(404);
    expect((await request(app).patch(`/api/programs/${different.id}/days/${day.id}`).set('Authorization', bearer(member)).send({ title: 'Moved' })).status).toBe(404);
    expect((await request(app).patch(`/api/programs/${program.id}/days/invalid`).set('Authorization', bearer(member)).send({ title: 'Bad' })).status).toBe(400);
    expect((await request(app).patch(`/api/programs/${program.id}/days/${randomUUID()}`).set('Authorization', bearer(member)).send({ title: 'Missing' })).status).toBe(404);
  });
  it('requires authentication and denies admins on every program route', async () => {
    const program = (await create(member)).body.program;
    const day = (await addDay(member, program.id, { dayNumber: 1, title: 'Day' })).body.day;
    for (const authorization of [null, bearer(admin)]) {
      const requests = [request(app).get('/api/programs'), request(app).post('/api/programs').send({ name: 'No' }), request(app).get(`/api/programs/${program.id}`), request(app).patch(`/api/programs/${program.id}`).send({ name: 'No' }), request(app).post(`/api/programs/${program.id}/days`).send({ dayNumber: 2, title: 'No' }), request(app).patch(`/api/programs/${program.id}/days/${day.id}`).send({ title: 'No' })];
      for (const pending of requests) {
        if (authorization) pending.set('Authorization', authorization);
        expect((await pending).status).toBe(authorization ? 403 : 401);
      }
    }
  });
});
