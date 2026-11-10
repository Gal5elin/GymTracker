import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { hash } from 'argon2';
import { createApp } from './app.js';
import { prisma } from './db.js';
const origin = 'http://localhost:5173';
const secret = 'sessions-test-secret-at-least-32-characters';
const app = createApp(origin, secret);
const password = 'Session-test-password-123!';
let userId: string;
let email: string;
const login = () => request(app).post('/api/auth/login').set('Origin', origin).send({ email, password });
function cookie(response: request.Response) { return response.headers['set-cookie'][0].split(';')[0] as string; }
const restore = (value: string) => request(app).post('/api/auth/session').set('Origin', origin).set('Cookie', value);
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  email = `${randomUUID()}@sessions.test`;
  const user = await prisma.user.create({ data: { email, displayName: 'Persistent user', passwordHash: await hash(password) } });
  userId = user.id;
}, 30_000);
afterAll(async () => { try { if (userId) await prisma.user.delete({ where: { id: userId } }); } finally { await prisma.$disconnect(); } });
it('restores login with an HttpOnly persistent cookie, storing only its hash', async () => {
  const response = await login();
  expect(response.status).toBe(200);
  const value = cookie(response);
  expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  expect(response.headers['set-cookie'][0]).toContain('SameSite=Strict');
  expect(response.headers['set-cookie'][0]).toContain('Max-Age=2592000');
  expect(response.headers['set-cookie'][0]).toContain('Path=/api/auth');
  const token = value.split('=')[1];
  const row = await prisma.authSession.findUnique({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } });
  expect(row?.userId).toBe(userId);
  expect(row?.tokenHash).not.toBe(token);
  const restored = await restore(value);
  expect(restored.status).toBe(200);
  expect(restored.body.user.id).toBe(userId);
  expect(restored.body.user).not.toHaveProperty('passwordHash');
  expect(restored.headers['cache-control']).toBe('no-store');
});
it('logout revokes both cookie and already issued access tokens, and is idempotent', async () => {
  const response = await login(); const value = cookie(response);
  const logout = () => request(app).post('/api/auth/logout').set('Cookie', value);
  expect((await logout()).status).toBe(204);
  expect((await restore(value)).status).toBe(401);
  expect((await request(app).get('/api/auth/me').auth(response.body.accessToken, { type: 'bearer' })).status).toBe(401);
  expect((await logout()).status).toBe(204);
});
it('rejects expired and forged sessions and checks current account status', async () => {
  const response = await login(); const value = cookie(response);
  await prisma.authSession.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
  expect((await restore(value)).status).toBe(401);
  expect((await restore('gymtracker_session=forged')).status).toBe(401);
  expect((await request(app).post('/api/auth/session')).status).toBe(401);
  const fresh = await login();
  await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  expect((await restore(cookie(fresh))).status).toBe(401);
  await prisma.user.update({ where: { id: userId }, data: { isActive: true, role: 'TRAINER' } });
  expect((await restore(cookie(fresh))).body.user.role).toBe('TRAINER');
});
it('blocks cross-origin cookie mutations and enables credentials only for the configured origin', async () => {
  for (const endpoint of ['login', 'session', 'logout']) {
    expect((await request(app).post(`/api/auth/${endpoint}`).set('Origin', 'https://evil.example').send({ email, password })).status).toBe(403);
    expect((await request(app).post(`/api/auth/${endpoint}`).set('Sec-Fetch-Site', 'cross-site')).status).toBe(403);
  }
  const response = await login();
  expect(response.headers['access-control-allow-origin']).toBe(origin);
  expect(response.headers['access-control-allow-credentials']).toBe('true');
});
it('sets Secure cookies when configured for production', async () => {
  const response = await request(createApp(origin, secret, true)).post('/api/auth/login').send({ email, password });
  expect(response.headers['set-cookie'][0]).toContain('; Secure');
});
it('a subsequent login replaces the current browser session without revoking other devices', async () => {
  const first = await login(); const other = await login();
  const replacement = await request(app).post('/api/auth/login').set('Cookie', cookie(first)).send({ email, password });
  expect((await restore(cookie(first))).status).toBe(401);
  expect((await restore(cookie(replacement))).status).toBe(200);
  expect((await restore(cookie(other))).status).toBe(200);
});
