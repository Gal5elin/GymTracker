import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { createApp, handleError } from './app.js';
import { requireAuthentication } from './auth.js';
import { prisma } from './db.js';
import { authenticatedUser, requireRoles, requireProgramOwner, requireDayOwner, requireWorkoutOwner, requireMemberResultsAccess, requireTrainerAssignment } from './permissions.js';

const secret = 'test-only-secret-at-least-32-characters';
const productionApp = createApp('http://localhost:5173', secret);
// Test-only resource routes exercise the same middleware/services future feature routes use.
const app = express();
app.use(express.json(), requireAuthentication(secret));
app.get('/trainer', requireRoles('TRAINER'), (_req, res) => res.sendStatus(204));
app.get('/admin', requireRoles('ADMIN'), (_req, res) => res.sendStatus(204));
app.get('/programs/:id', async (req, res) => { await requireProgramOwner(authenticatedUser(res), req.params.id); res.sendStatus(204); });
app.get('/days/:id', async (req, res) => { await requireDayOwner(authenticatedUser(res), req.params.id); res.sendStatus(204); });
app.post('/workouts/:id/sets', async (req, res) => { await requireWorkoutOwner(authenticatedUser(res), req.params.id); res.sendStatus(204); });
app.get('/members/:id/results', async (req, res) => { await requireMemberResultsAccess(authenticatedUser(res), req.params.id); res.sendStatus(204); });
app.post('/assignments/:programId/:memberId', async (req, res) => { await requireTrainerAssignment(authenticatedUser(res), req.params.programId, req.params.memberId); res.sendStatus(204); });
app.use(handleError);
const users: string[] = [];
const programs: string[] = [];
const days: string[] = [];
const sessions: string[] = [];
const links: string[] = [];
let member: string, other: string, trainer: string, admin: string;
let memberProgram: string, trainerProgram: string, day: string, workout: string, trainerWorkout: string, link: string;
function bearer(id: string) { return `Bearer ${jwt.sign({ sid: id }, secret, { subject: id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 })}`; }
async function user(role: Role) {
  const record = await prisma.user.create({ data: { email: `${randomUUID()}@permissions.test`, passwordHash: 'not-used-for-login', displayName: role, role } });
  await prisma.authSession.create({ data: { id: record.id, userId: record.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  users.push(record.id); return record.id;
}
async function program(ownerId: string) {
  const record = await prisma.workoutProgram.create({ data: { ownerId, name: 'Permission test' } });
  programs.push(record.id); return record.id;
}
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  member = await user('MEMBER'); other = await user('MEMBER'); trainer = await user('TRAINER'); admin = await user('ADMIN');
  memberProgram = await program(member); trainerProgram = await program(trainer);
  const d = await prisma.programDay.create({ data: { programId: memberProgram, dayNumber: 1, title: 'Day' } }); day = d.id; days.push(day);
  for (const id of [member, trainer]) {
    const session = await prisma.workoutSession.create({ data: { memberId: id, programDayId: day } });
    sessions.push(session.id); if (id === member) workout = session.id; else trainerWorkout = session.id;
  }
  const relationship = await prisma.trainerLink.create({ data: { trainerId: trainer, memberId: member, status: 'ACCEPTED' } });
  link = relationship.id; links.push(link);
}, 30_000);
afterAll(async () => {
  try {
    await prisma.workoutSession.deleteMany({ where: { id: { in: sessions } } });
    await prisma.programDay.deleteMany({ where: { id: { in: days } } });
    await prisma.workoutProgram.deleteMany({ where: { id: { in: programs } } });
    await prisma.trainerLink.deleteMany({ where: { id: { in: links } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  } finally { await prisma.$disconnect(); }
});

describe('server authorization', () => {
  it.each(['/api/programs', '/api/assignments', '/api/workout-sessions', '/api/progress', '/api/trainer-links'])('protects production namespace %s and denies admin access', async path => {
    expect((await request(productionApp).get(path)).status).toBe(401);
    expect((await request(productionApp).get(path).set('Authorization', bearer(admin))).status).toBe(403);
    // Programs are implemented; the remaining feature namespaces still reach the 404.
    expect((await request(productionApp).get(path).set('Authorization', bearer(member))).status).toBe(path === '/api/programs' ? 200 : 404);
  });
  it('restricts trainer/admin actions to their exact roles', async () => {
    for (const id of [member, trainer, admin]) {
      expect((await request(app).get('/trainer').set('Authorization', bearer(id))).status).toBe(id === trainer ? 204 : 403);
      expect((await request(app).get('/admin').set('Authorization', bearer(id))).status).toBe(id === admin ? 204 : 403);
    }
  });
  it('enforces program and nested day ownership even with forged body fields', async () => {
    for (const path of [`/programs/${memberProgram}`, `/days/${day}`]) {
      expect((await request(app).get(path).set('Authorization', bearer(member))).status).toBe(204);
      for (const id of [other, trainer, admin]) {
        expect((await request(app).get(path).set('Authorization', bearer(id)).send({ ownerId: id, role: 'ADMIN' })).status).toBe(403);
      }
    }
    expect((await request(app).get(`/programs/${trainerProgram}`).set('Authorization', bearer(trainer))).status).toBe(204);
  });
  it('allows self-owned workouts for members and trainers, never another member or admin', async () => {
    expect((await request(app).post(`/workouts/${workout}/sets`).set('Authorization', bearer(member))).status).toBe(204);
    expect((await request(app).post(`/workouts/${trainerWorkout}/sets`).set('Authorization', bearer(trainer))).status).toBe(204);
    for (const id of [other, trainer, admin]) expect((await request(app).post(`/workouts/${workout}/sets`).set('Authorization', bearer(id))).status).toBe(403);
  });
  it('allows private self-results and accepted trainer reads but never admin or another member', async () => {
    for (const id of [member, trainer, other, admin]) {
      expect((await request(app).get(`/members/${member}/results`).set('Authorization', bearer(id))).status).toBe(id === member || id === trainer ? 204 : 403);
    }
    expect((await request(app).get(`/members/${trainer}/results`).set('Authorization', bearer(trainer))).status).toBe(204);
  });
  it('requires trainer-owned programs and accepted recipients for assignments', async () => {
    expect((await request(app).post(`/assignments/${trainerProgram}/${member}`).set('Authorization', bearer(trainer))).status).toBe(204);
    for (const [id, programId, recipient] of [[member, memberProgram, other], [admin, trainerProgram, member], [trainer, memberProgram, member], [trainer, trainerProgram, other]]) {
      expect((await request(app).post(`/assignments/${programId}/${recipient}`).set('Authorization', bearer(id))).status).toBe(403);
    }
  });
  it('rechecks consent for every results read and assignment', async () => {
    try {
      for (const status of ['PENDING', 'REJECTED', 'REVOKED'] as const) {
        await prisma.trainerLink.update({ where: { id: link }, data: { status } });
        expect((await request(app).get(`/members/${member}/results`).set('Authorization', bearer(trainer))).status).toBe(403);
        expect((await request(app).post(`/assignments/${trainerProgram}/${member}`).set('Authorization', bearer(trainer))).status).toBe(403);
        expect((await request(app).get(`/members/${member}/results`).set('Authorization', bearer(member))).status).toBe(204);
      }
    } finally { await prisma.trainerLink.update({ where: { id: link }, data: { status: 'ACCEPTED' } }); }
  });
  it('uses current server roles instead of stale or client-supplied roles', async () => {
    const token = bearer(trainer);
    try {
      await prisma.user.update({ where: { id: trainer }, data: { role: 'MEMBER' } });
      expect((await request(app).get('/trainer').set('Authorization', token).send({ role: 'TRAINER' })).status).toBe(403);
    } finally { await prisma.user.update({ where: { id: trainer }, data: { role: 'TRAINER' } }); }
  });
  it('distinguishes invalid IDs, missing records and absent authentication', async () => {
    expect((await request(app).get(`/programs/${memberProgram}`)).status).toBe(401);
    expect((await request(app).get('/programs/invalid').set('Authorization', bearer(member))).status).toBe(400);
    expect((await request(app).get(`/programs/${randomUUID()}`).set('Authorization', bearer(member))).status).toBe(404);
  });
});
