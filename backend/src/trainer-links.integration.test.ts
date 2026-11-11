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

const list = (actor = member) => request(app).get('/api/trainer-links').set('Authorization', bearer(actor));
const respond = (id: string, status = 'ACCEPTED', actor = member) => request(app).patch(`/api/trainer-links/${id}`).set('Authorization', bearer(actor)).send({ status });
async function pending() { const response = await invite(); expect(response.status).toBe(201); return response.body.invitation.id as string; }
it('lists only the recipient invitations, including trainer display name and current status', async () => {
  const id = await pending(); const other = await account('MEMBER');
  await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: other.id } });
  const old = await prisma.trainerLink.create({ data: { trainerId: otherTrainer, memberId: member, status: 'REJECTED', createdAt: new Date('2020-01-01') } });
  const response = await list(); expect(response.status).toBe(200); expect(response.body.invitations.map((i: { id: string }) => i.id)).toEqual([id, old.id]);
  expect(response.body.invitations[0]).toMatchObject({ id, memberId: member, status: 'PENDING', trainer: { id: trainer, displayName: 'TRAINER' } });
  expect(response.headers['cache-control']).toBe('no-store');
  expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|email/);
  expect((await list(other.id)).body.invitations).toHaveLength(1);
});
it('returns an empty list and rejects recipient selection query parameters', async () => {
  expect((await list()).body).toEqual({ invitations: [] });
  expect((await request(app).get(`/api/trainer-links?memberId=${member}`).set('Authorization', bearer(member))).status).toBe(400);
});
it.each(['ACCEPTED', 'REJECTED'])('lets the recipient persist %s and denies subsequent responses', async status => {
  const id = await pending(); const response = await respond(id, status);
  expect(response.status).toBe(200); expect(response.body.invitation).toMatchObject({ id, status, trainer: { id: trainer } });
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id } })).status).toBe(status);
  expect((await list()).body.invitations[0].status).toBe(status);
  expect((await respond(id, status === 'ACCEPTED' ? 'REJECTED' : 'ACCEPTED')).status).toBe(409);
  expect((await respond(id, status)).status).toBe(409);
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id } })).status).toBe(status);
});
it('allows exactly one winner for concurrent opposing responses', async () => {
  const id = await pending(); const responses = await Promise.all([respond(id, 'ACCEPTED'), respond(id, 'REJECTED')]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const winner = responses.find(r => r.status === 200)!;
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id } })).status).toBe(winner.body.invitation.status);
});
it('serializes acceptance with invitation creation so a connected pair has no extra pending invite', async () => {
  const id = await pending(); const responses = await Promise.all([respond(id), invite()]);
  expect(responses.map(r => r.status)).toEqual([200, 409]);
  expect(await prisma.trainerLink.count({ where: { trainerId: trainer, memberId: member } })).toBe(1);
});
it('denies other members, trainers, admins, inactive users and unauthenticated responses', async () => {
  const id = await pending(); const other = await account('MEMBER');
  expect((await respond(id, 'ACCEPTED', other.id)).status).toBe(403);
  for (const actor of [trainer, otherTrainer, admin]) { expect((await respond(id, 'ACCEPTED', actor)).status).toBe(403); expect((await list(actor)).status).toBe(403); }
  expect((await respond(id, 'ACCEPTED', inactive)).status).toBe(401);
  expect((await request(app).patch(`/api/trainer-links/${id}`).send({ status: 'ACCEPTED' })).status).toBe(401);
  expect((await request(app).get('/api/trainer-links')).status).toBe(401);
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
});
it('rejects invalid IDs, missing records, forged fields and unsupported states', async () => {
  const id = await pending(); expect((await respond('bad')).status).toBe(400); expect((await respond(randomUUID())).status).toBe(404);
  for (const body of [{}, { status: 'PENDING' }, { status: 'UNKNOWN' }, { status: 'accepted' }, { status: null }, { status: 'ACCEPTED', memberId: member }, { status: 'ACCEPTED', trainerId: otherTrainer }]) {
    expect((await request(app).patch(`/api/trainer-links/${id}`).set('Authorization', bearer(member)).send(body)).status).toBe(400);
  }
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
});
it('does not answer a revoked link or accept an unavailable trainer', async () => {
  const id = await pending(); await prisma.trainerLink.update({ where: { id }, data: { status: 'REVOKED' } }); expect((await respond(id)).status).toBe(409);
  const nextId = await pending(); await prisma.user.update({ where: { id: trainer }, data: { isActive: false } });
  try { expect((await respond(nextId)).status).toBe(409); expect((await respond(nextId, 'REJECTED')).status).toBe(200); }
  finally { await prisma.user.update({ where: { id: trainer }, data: { isActive: true } }); }
});
it.each(['ACCEPTED', 'REJECTED'])('grants consent permissions only after acceptance, decision %s', async status => {
  const id = await pending(); await respond(id, status); const actor = { id: trainer, role: 'TRAINER' as const, isActive: true };
  const program = await prisma.workoutProgram.create({ data: { ownerId: trainer, name: 'Consent plan' } });
  try {
    if (status === 'ACCEPTED') { await expect(requireMemberResultsAccess(actor, member)).resolves.toBeUndefined(); await expect(requireTrainerAssignment(actor, program.id, member)).resolves.toMatchObject({ id: program.id }); }
    else { await expect(requireMemberResultsAccess(actor, member)).rejects.toMatchObject({ status: 403 }); await expect(requireTrainerAssignment(actor, program.id, member)).rejects.toMatchObject({ status: 403 }); }
  } finally { await prisma.workoutProgram.delete({ where: { id: program.id } }); }
});


it('revokes an accepted relationship and immediately denies results and new assignments', async () => {
  const id = await pending(); await respond(id);
  const actor = { id: trainer, role: 'TRAINER' as const, isActive: true };
  await expect(requireMemberResultsAccess(actor, member)).resolves.toBeUndefined();
  const program = await prisma.workoutProgram.create({ data: { ownerId: trainer, name: 'Revocation plan' } });
  try {
    await expect(requireTrainerAssignment(actor, program.id, member)).resolves.toMatchObject({ id: program.id });
    const response = await respond(id, 'REVOKED'); expect(response.status).toBe(200);
    expect(response.body.invitation).toMatchObject({ id, trainerId: trainer, memberId: member, status: 'REVOKED', trainer: { id: trainer } });
    expect(response.headers['cache-control']).toBe('no-store');
    expect((await list()).body.invitations[0].status).toBe('REVOKED');
    await expect(requireMemberResultsAccess(actor, member)).rejects.toMatchObject({ status: 403 });
    await expect(requireTrainerAssignment(actor, program.id, member)).rejects.toMatchObject({ status: 403 });
    await expect(requireAcceptedMember(actor, member)).rejects.toMatchObject({ status: 403 });
    expect((await respond(id)).status).toBe(409);
    expect((await invite()).status).toBe(201);
  } finally { await prisma.workoutProgram.delete({ where: { id: program.id } }); }
});
it('restricts revocation to the linked active member without requiring an active trainer', async () => {
  const id = await pending(); await respond(id); const other = await account('MEMBER');
  for (const actor of [other.id, trainer, otherTrainer, admin]) expect((await respond(id, 'REVOKED', actor)).status).toBe(403);
  expect((await respond(id, 'REVOKED', inactive)).status).toBe(401);
  expect((await request(app).patch(`/api/trainer-links/${id}`).send({ status: 'REVOKED' })).status).toBe(401);
  expect((await respond('invalid', 'REVOKED')).status).toBe(400);
  expect((await respond(randomUUID(), 'REVOKED')).status).toBe(404);
  await prisma.user.update({ where: { id: trainer }, data: { isActive: false } });
  try { expect((await respond(id, 'REVOKED')).status).toBe(200); }
  finally { await prisma.user.update({ where: { id: trainer }, data: { isActive: true } }); }
});
it.each(['PENDING', 'REJECTED', 'REVOKED'] as const)('rejects revocation of %s links', async status => {
  const row = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status } });
  expect((await respond(row.id, 'REVOKED')).status).toBe(409);
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(status);
});
it('allows exactly one concurrent revocation and does not revoke other trainers', async () => {
  const id = await pending(); await respond(id);
  const other = await prisma.trainerLink.create({ data: { trainerId: otherTrainer, memberId: member, status: 'ACCEPTED' } });
  const responses = await Promise.all([respond(id, 'REVOKED'), respond(id, 'REVOKED')]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  expect((await prisma.trainerLink.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('ACCEPTED');
  await expect(requireAcceptedMember({ id: otherTrainer, role: 'TRAINER', isActive: true }, member)).resolves.toMatchObject({ id: other.id });
});
it('preserves assigned programs and completed results, and lets the member start another assigned workout', async () => {
  const id = await pending(); await respond(id);
  const exercise = await prisma.exercise.create({ data: { name: 'Revocation exercise', muscleGroup: 'Legs', equipment: 'Barbell' } });
  const program = await prisma.workoutProgram.create({ data: { ownerId: trainer, name: 'Assigned plan', days: { create: { dayNumber: 1, title: 'Assigned day', exercises: { create: { exerciseId: exercise.id, position: 1, targetSets: 1, targetReps: 8 } } } } }, include: { days: true } });
  const assignment = await prisma.programAssignment.create({ data: { programId: program.id, memberId: member, assignedById: trainer } });
  const start = () => request(app).post('/api/workout-sessions').set('Authorization', bearer(member)).send({ programId: program.id, dayId: program.days[0].id, assignmentId: assignment.id });
  try {
    const started = await start(); expect(started.status).toBe(201); const workoutId = started.body.workout.id;
    expect((await request(app).post(`/api/workout-sessions/${workoutId}/sets`).set('Authorization', bearer(member)).send({ exerciseId: exercise.id, exercisePosition: 1, setNumber: 1, reps: 8, weightKg: 25 })).status).toBe(201);
    expect((await request(app).post(`/api/workout-sessions/${workoutId}/complete`).set('Authorization', bearer(member)).send({ notes: 'Keep these results' })).status).toBe(200);
    const before = await prisma.workoutSession.findUniqueOrThrow({ where: { id: workoutId }, include: { sets: true } });
    expect((await respond(id, 'REVOKED')).status).toBe(200);
    expect(await prisma.workoutSession.findUniqueOrThrow({ where: { id: workoutId }, include: { sets: true } })).toEqual(before);
    expect(await prisma.programAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).toEqual(assignment);
    const history = await request(app).get(`/api/workout-sessions/history/${workoutId}`).set('Authorization', bearer(member));
    expect(history.status).toBe(200); expect(history.body.workout.notes).toBe('Keep these results');
    const progress = await request(app).get(`/api/progress/${exercise.id}`).set('Authorization', bearer(member));
    expect(progress.status).toBe(200); expect(progress.body.points[0]).toMatchObject({ workoutId, maxWeightKg: '25' });
    expect((await request(app).get(`/api/workout-sessions/history/${workoutId}`).set('Authorization', bearer(trainer))).status).toBe(403);
    expect((await start()).status).toBe(201);
  } finally {
    await prisma.sessionSet.deleteMany({ where: { session: { assignmentId: assignment.id } } });
    await prisma.workoutSession.deleteMany({ where: { assignmentId: assignment.id } });
    await prisma.programAssignment.delete({ where: { id: assignment.id } });
    await prisma.programExercise.deleteMany({ where: { dayId: program.days[0].id } });
    await prisma.programDay.delete({ where: { id: program.days[0].id } });
    await prisma.workoutProgram.delete({ where: { id: program.id } });
    await prisma.exercise.delete({ where: { id: exercise.id } });
  }
});
