import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { verify } from 'argon2';
import { createApp } from './app.js';
import { prisma } from './db.js';

const app = createApp('http://localhost:5173', 'test-only-secret-at-least-32-characters');
const emails: string[] = [];
const password = 'Registration-test-123!';
function details() {
  const email = `${randomUUID()}@registration.test`;
  emails.push(email);
  return { email, displayName: 'Test member', password };
}
const register = (body: unknown) => request(app).post('/api/auth/register').send(body as object);

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('prisma/package.json')), 'build/index.js');
  execFileSync(process.execPath, [cli, 'migrate', 'deploy'], { stdio: 'pipe' });
}, 30_000);

afterAll(async () => {
  try {
    if (emails.length) await prisma.user.deleteMany({ where: { email: { in: emails } } });
  } finally {
    await prisma.$disconnect();
  }
});

describe('POST /api/auth/register', () => {
  it('persists an active member with a verifiable Argon2id hash and safe response', async () => {
    const input = details();
    const response = await register({ ...input, displayName: '  Test member  ', email: `  ${input.email.toUpperCase()}  ` });
    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: expect.any(String), displayName: 'Test member', email: input.email,
      role: 'MEMBER', isActive: true, createdAt: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('password');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.role).toBe('MEMBER');
    expect(user.isActive).toBe(true);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verify(user.passwordHash, password)).toBe(true);
    expect(await verify(user.passwordHash, 'wrong password')).toBe(false);
  });

  it.each([false, true])('creates the selected account role when registerAsTrainer is %s', async registerAsTrainer => {
    const input = details();
    const response = await register({ ...input, registerAsTrainer });
    expect(response.status).toBe(201);
    const role = registerAsTrainer ? 'TRAINER' : 'MEMBER';
    expect(response.body.user.role).toBe(role);
    const saved = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(saved.role).toBe(role);
    expect(await verify(saved.passwordHash, password)).toBe(true);
  });

  it('rejects duplicate emails including case and surrounding whitespace', async () => {
    const input = details();
    expect((await register(input)).status).toBe(201);
    const response = await register({ ...input, email: ` ${input.email.toUpperCase()} ` });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('An account with this email already exists');
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(1);
  });

  it('handles simultaneous duplicate registrations without creating two accounts', async () => {
    const input = details();
    const responses = await Promise.all([register(input), register(input)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(1);
  });

  it.each([
    { displayName: undefined }, { email: undefined }, { password: undefined },
    { displayName: '   ' }, { email: 'invalid' }, { password: '' },
    { password: 'short' }, { password: 'x'.repeat(129) },
    { displayName: 'x'.repeat(101) }, { email: 123 }, { password: 123 },
    { registerAsTrainer: 'true' }, { registerAsTrainer: 1 }, { registerAsTrainer: null },
    { displayName: null }, { role: 'ADMIN' }, { role: 'TRAINER' },
    { isActive: false }, { passwordHash: 'supplied-hash' }, { id: randomUUID() },
  ])('rejects invalid or server-owned input without persisting a user: %j', async (override) => {
    const input = details();
    const response = await register({ ...input, ...override });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid registration details');
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(0);
    expect(JSON.stringify(response.body)).not.toContain(password);
  });

  it.each([null, [], 'text'])('rejects a non-object body: %j', async (body) => {
    const response = await request(app).post('/api/auth/register').set('Content-Type', 'application/json').send(JSON.stringify(body));
    expect(response.status).toBe(400);
  });

  it('rejects an absent body', async () => {
    expect((await request(app).post('/api/auth/register')).status).toBe(400);
  });
});
