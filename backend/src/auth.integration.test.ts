import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { hash, argon2id } from 'argon2';
import jwt from 'jsonwebtoken';
import { type Role } from '@prisma/client';
import { createApp } from './app.js';
import { prisma } from './db.js';

const secret = 'test-only-secret-at-least-32-characters';
const app = createApp('http://localhost:5173', secret);
const password = 'Login-test-password-123!';
const ids: string[] = [];
let passwordHash: string;
async function account(role: Role = 'MEMBER', isActive = true) {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@login.test`, displayName: 'Login test', passwordHash, role, isActive } });
  await prisma.authSession.create({ data: { id: user.id, userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  ids.push(user.id);
  return user;
}
function token(subject: string, options: jwt.SignOptions = {}, signingSecret = secret) {
  return jwt.sign({ sid: subject }, signingSecret, { subject, algorithm: 'HS256', issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600, ...options });
}
const login = (email: string, suppliedPassword = password) => request(app).post('/api/auth/login').send({ email, password: suppliedPassword });
const me = (accessToken: string) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`);

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [join(dirname(require.resolve('prisma/package.json')), 'build/index.js'), 'migrate', 'deploy'], { stdio: 'pipe' });
  passwordHash = await hash(password, { type: argon2id });
}, 30_000);
afterAll(async () => {
  try { if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } }); }
  finally { await prisma.$disconnect(); }
});

describe('Login and protected API authentication', () => {
  it.each(['MEMBER', 'TRAINER', 'ADMIN'] as const)('authenticates %s and returns a usable expiring JWT without credentials', async role => {
    const user = await account(role);
    const response = await login(` ${user.email.toUpperCase()} `);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 3600, user: { id: user.id, role } });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    const payload = jwt.verify(response.body.accessToken, secret, { algorithms: ['HS256'], issuer: 'gymtracker', audience: 'gymtracker-api' }) as jwt.JwtPayload;
    expect(payload.sub).toBe(user.id);
    expect(payload.exp! - payload.iat!).toBe(3600);
    const protectedResponse = await me(response.body.accessToken);
    expect(protectedResponse.status).toBe(200);
    expect(protectedResponse.body.user).toEqual(response.body.user);
  });
  it('rejects wrong passwords, unknown emails and inactive accounts with the same error', async () => {
    const user = await account();
    const inactive = await account('MEMBER', false);
    for (const response of [await login(user.email, 'wrong'), await login(`${randomUUID()}@login.test`), await login(inactive.email)]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid email or password' });
      expect(response.body).not.toHaveProperty('accessToken');
    }
  });
  it.each([{}, { email: 'bad', password }, { email: 'a@example.com' }, { email: 'a@example.com', password: '' }, { email: 'a@example.com', password: 123 }, { email: 'a@example.com', password, role: 'ADMIN' }])('rejects malformed login input %j', async body => {
    expect((await request(app).post('/api/auth/login').send(body)).status).toBe(400);
  });
  it.each(['', 'Basic abc', 'Bearer', 'Bearer garbage', 'Bearer one two'])('rejects missing or malformed authorization: %s', async authorization => {
    const response = await request(app).get('/api/auth/me').set('Authorization', authorization);
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });
  it('rejects expired, future, incorrectly signed, wrong-algorithm, wrong-issuer and wrong-audience tokens', async () => {
    const user = await account();
    const invalid = [
      token(user.id, { expiresIn: -1 }), token(user.id, { notBefore: 3600 }),
      token(user.id, {}, 'another-secret-at-least-32-characters'),
      token(user.id, { algorithm: 'HS384' }), token(user.id, { issuer: 'another-app' }),
      token(user.id, { audience: 'another-api' }), token('not-a-uuid'),
      jwt.sign({ sub: user.id, iss: 'gymtracker', aud: 'gymtracker-api' }, secret),
      jwt.sign({}, secret, { subject: user.id, issuer: 'gymtracker', audience: 'gymtracker-api', expiresIn: 3600 }),
    ];
    for (const value of invalid) expect((await me(value)).status).toBe(401);
  });
  it('rejects tampered tokens', async () => {
    const user = await account();
    const parts = token(user.id).split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: randomUUID(), exp: 9999999999 })).toString('base64url');
    expect((await me(parts.join('.'))).status).toBe(401);
  });
  it('uses current account status and role on every protected request', async () => {
    const user = await account();
    const value = token(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { role: 'TRAINER' } });
    expect((await me(value)).body.user.role).toBe('TRAINER');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect((await me(value)).status).toBe(401);
  });
  it('rejects tokens for deleted or nonexistent accounts', async () => {
    const user = await account();
    await prisma.user.delete({ where: { id: user.id } });
    expect((await me(token(user.id))).status).toBe(401);
    expect((await me(token(randomUUID()))).status).toBe(401);
  });
  it('does not accept a token supplied in the query string', async () => {
    const user = await account();
    expect((await request(app).get('/api/auth/me').query({ accessToken: token(user.id) })).status).toBe(401);
  });
});
