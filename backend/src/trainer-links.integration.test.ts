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
import { requireAcceptedMember, requireMemberResultsAccess, requireTrainerAssignment } from './permissions.js';
const secret = 'invitation-test-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const users: string[] = [];
let trainer: string, otherTrainer: string, member: string, admin: string, inactive: string, email: string;
const bearer = (id: string) => `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`;
async function account(role: Role, isActive = true) {
  const row = await prisma.user.create({ data: { email: `${randomUUID()}@invitations.test`, displayName: role, passwordHash: 'not-used', role, isActive } }); users.push(row.id);
  await prisma.authSession.create({ data: { id: row.id, userId: row.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  return row;
}
const invite = (actor = trainer, body: object = { email }) => request(app).post('/api/trainer-links').set('Authorization', bearer(actor)).send(body);
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  trainer = (await account('TRAINER')).id; otherTrainer = (await account('TRAINER')).id;
  const row = await account('MEMBER'); member = row.id; email = row.email;
  admin = (await account('ADMIN')).id; inactive = (await account('MEMBER', false)).id;
}, 30_000);
afterEach(async () => { await prisma.trainerLink.deleteMany({ where: { trainerId: { in: users } } }); });
afterAll(async () => {
  try { await prisma.user.deleteMany({ where: { id: { in: users } } }); } finally { await prisma.$disconnect(); }
});
it('persists a pending invitation with the authenticated trainer and normalized member email', async () => {
  const response = await invite(trainer, { email: `  ${email.toUpperCase()}  ` }); expect(response.status).toBe(201);
  expect(response.body.invitation).toMatchObject({ trainerId: trainer, memberId: member, status: 'PENDING' });
  expect(response.body.invitation.createdAt).toBeTruthy();
  expect(await prisma.trainerLink.findUnique({ where: { id: response.body.invitation.id } })).toMatchObject({ trainerId: trainer, memberId: member, status: 'PENDING' });
  expect(JSON.stringify(response.body)).not.toContain('password'); expect(response.headers['cache-control']).toBe('no-store');
});
it('rejects duplicate pending invitations including concurrent requests', async () => {
  const responses = await Promise.all([invite(), invite(), invite()]); expect(responses.map(r => r.status).sort()).toEqual([201, 409, 409]);
  expect(await prisma.trainerLink.count({ where: { trainerId: trainer, memberId: member } })).toBe(1);
});
it('enforces pending pair uniqueness in the database', async () => {
  await invite(); await expect(prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member } })).rejects.toMatchObject({ code: 'P2002' });
});
it('allows different trainers and new invitations after rejected or revoked history', async () => {
  await prisma.trainerLink.createMany({ data: ['REJECTED', 'REVOKED'].map(status => ({ trainerId: trainer, memberId: member, status: status as 'REJECTED' | 'REVOKED' })) });
  expect((await invite()).status).toBe(201); expect((await invite(otherTrainer)).status).toBe(201);
});
it('does not create another invitation for an accepted relationship', async () => {
  await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } }); expect((await invite()).status).toBe(409);
});
it('rejects missing, inactive and non-member targets', async () => {
  for (const id of [trainer, otherTrainer, admin, inactive]) {
    const target = await prisma.user.findUniqueOrThrow({ where: { id } }); expect((await invite(trainer, { email: target.email })).status).toBe(400);
  }
  expect((await invite(trainer, { email: 'missing@invitations.test' })).status).toBe(400);
  expect(await prisma.trainerLink.count({ where: { trainerId: trainer } })).toBe(0);
});
it('rejects invalid fields and attempts to forge identities or status', async () => {
  for (const body of [{}, { email: 'bad' }, { email: null }, { email, trainerId: otherTrainer }, { email, memberId: member }, { email, status: 'ACCEPTED' }]) expect((await invite(trainer, body)).status).toBe(400);
});
it('requires an active authenticated trainer', async () => {
  expect((await request(app).post('/api/trainer-links').send({ email })).status).toBe(401);
  for (const id of [member, admin]) expect((await invite(id)).status).toBe(403);
  expect((await invite(inactive)).status).toBe(401);
});
it('pending invitations grant no results or assignment access', async () => {
  await invite(); const actor = { id: trainer, role: 'TRAINER' as const, isActive: true };
  await expect(requireAcceptedMember(actor, member)).rejects.toMatchObject({ status: 403 });
  await expect(requireMemberResultsAccess(actor, member)).rejects.toMatchObject({ status: 403 });
  const program = await prisma.workoutProgram.create({ data: { ownerId: trainer, name: 'Private trainer plan' } });
  try { await expect(requireTrainerAssignment(actor, program.id, member)).rejects.toMatchObject({ status: 403 }); }
  finally { await prisma.workoutProgram.delete({ where: { id: program.id } }); }
});
