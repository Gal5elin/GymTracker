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
const secret = 'invitation-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [];
let trainer: string, otherTrainer: string, member: string, admin: string, inactive: string, programId: string, otherProgram: string;
const programs: string[] = [];
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role, isActive = true) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@invitations.test`, displayName: role, passwordHash: 'not-used', role, isActive } }); users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row;
}
const assign = (actor = trainer, body: object = { programId, memberId: member }) => request(app).post('/api/assignments').set('Authorization', bearer(actor)).send(body);
async function program(ownerId: string) { const row = await prisma.workoutProgram.create({ data: { ownerId, name: 'Assignment plan' } }); programs.push(row.id); return row.id; }
async function link(status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'REVOKED' = 'ACCEPTED', recipient = member) { return prisma.trainerLink.create({ data: { trainerId: trainer, memberId: recipient, status } }); }
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  trainer = (await account('TRAINER')).id; otherTrainer = (await account('TRAINER')).id;
  const row = await account('MEMBER'); member = row.id;
  admin = (await account('ADMIN')).id; inactive = (await account('MEMBER', false)).id;
  programId = await program(trainer); otherProgram = await program(otherTrainer);
}, 30_000);
afterEach(async () => { await prisma.programAssignment.deleteMany({ where: { programId: { in: programs } } }); await prisma.trainerLink.deleteMany({ where: { trainerId: { in: users } } }); });
afterAll(async () => {
  try { await prisma.workoutProgram.deleteMany({ where: { id: { in: programs } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); } finally { await prisma.$disconnect(); }
});
it('persists program, recipient, authenticated trainer and server timestamp', async () => {
  await link(); const before = Date.now(); const response = await assign(); expect(response.status).toBe(201);
  expect(response.body.assignment).toMatchObject({ programId, memberId: member, assignedById: trainer });
  expect(Date.parse(response.body.assignment.assignedAt)).toBeGreaterThanOrEqual(before);
  expect(await prisma.programAssignment.findUnique({ where: { id: response.body.assignment.id } })).toMatchObject({ programId, memberId: member, assignedById: trainer });
  expect(response.headers['cache-control']).toBe('no-store');
});
it('returns the original assignment on retries, including concurrent requests', async () => {
  await link(); const responses = await Promise.all([assign(), assign(), assign()]); expect(responses.map(r => r.status).sort()).toEqual([200, 200, 201]);
  expect(new Set(responses.map(r => r.body.assignment.id)).size).toBe(1); expect(new Set(responses.map(r => r.body.assignment.assignedAt)).size).toBe(1);
  expect(await prisma.programAssignment.count({ where: { programId, memberId: member } })).toBe(1);
});
it('allows different programs and multiple accepted members independently', async () => {
  await link(); const other = await account('MEMBER'); await link('ACCEPTED', other.id); const nextProgram = await program(trainer);
  for (const body of [{ programId, memberId: member }, { programId: nextProgram, memberId: member }, { programId, memberId: other.id }]) expect((await assign(trainer, body)).status).toBe(201);
});
it.each(['PENDING', 'REJECTED', 'REVOKED'] as const)('denies %s relationships', async status => {
  await link(status); expect((await assign()).status).toBe(403); expect(await prisma.programAssignment.count({ where: { programId } })).toBe(0);
});
it('denies unrelated, missing, inactive and non-member recipients', async () => {
  expect((await assign()).status).toBe(403);
  for (const id of [inactive, otherTrainer, admin]) { await link('ACCEPTED', id); expect((await assign(trainer, { programId, memberId: id })).status).toBe(403); }
  expect((await assign(trainer, { programId, memberId: randomUUID() })).status).toBe(403);
  expect((await assign(trainer, { programId, memberId: trainer })).status).toBe(403);
});
it('denies programs belonging to other trainers or members and missing programs', async () => {
  await link(); const memberProgram = await program(member);
  for (const id of [otherProgram, memberProgram]) expect((await assign(trainer, { programId: id, memberId: member })).status).toBe(403);
  expect((await assign(trainer, { programId: randomUUID(), memberId: member })).status).toBe(404);
});
it('requires an active authenticated trainer and rejects forged assignment fields', async () => {
  await link(); expect((await request(app).post('/api/assignments').send({ programId, memberId: member })).status).toBe(401);
  for (const actor of [member, admin]) expect((await assign(actor)).status).toBe(403); expect((await assign(inactive)).status).toBe(401);
  for (const body of [{}, { programId: 'bad', memberId: member }, { programId, memberId: 'bad' }, { programId, memberId: member, assignedById: otherTrainer }, { programId, memberId: member, assignedAt: '2020-01-01' }]) expect((await assign(trainer, body)).status).toBe(400);
});
it('makes assigned days available to the member without granting program editing access', async () => {
  await link(); const day = await prisma.programDay.create({ data: { programId, dayNumber: 1, title: 'Assigned day' } });
  try {
    const created = await assign(); expect(created.status).toBe(201);
    const options = await request(app).get('/api/workout-sessions/options').set('Authorization', bearer(member));
    expect(options.status).toBe(200); expect(options.body.programs).toEqual(expect.arrayContaining([expect.objectContaining({ id: programId, source: 'ASSIGNED', assignmentId: created.body.assignment.id, days: expect.arrayContaining([expect.objectContaining({ id: day.id })]) })]));
    expect((await request(app).patch(`/api/programs/${programId}`).set('Authorization', bearer(member)).send({ name: 'Changed' })).status).toBe(403);
  } finally { await prisma.programDay.delete({ where: { id: day.id } }); }
});
it('rechecks consent even for retries and preserves old assignments after revocation', async () => {
  const relationship = await link(); const created = await assign();
  expect((await request(app).patch(`/api/trainer-links/${relationship.id}`).set('Authorization', bearer(member)).send({ status: 'REVOKED' })).status).toBe(200);
  expect((await assign()).status).toBe(403);
  const nextProgram = await program(trainer); expect((await assign(trainer, { programId: nextProgram, memberId: member })).status).toBe(403);
  expect(await prisma.programAssignment.findUnique({ where: { id: created.body.assignment.id } })).not.toBeNull();
});
it('serializes with revocation: no assignment can commit based on already revoked consent', async () => {
  const relationship = await link();
  const [assigned, revoked] = await Promise.all([assign(), request(app).patch(`/api/trainer-links/${relationship.id}`).set('Authorization', bearer(member)).send({ status: 'REVOKED' })]);
  expect(revoked.status).toBe(200); expect([201, 403]).toContain(assigned.status);
  expect((await assign()).status).toBe(403);
  expect(await prisma.programAssignment.count({ where: { programId, memberId: member } })).toBe(assigned.status === 201 ? 1 : 0);
});
