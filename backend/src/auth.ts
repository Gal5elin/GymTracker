import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { verify } from 'argon2';
import { z } from 'zod';
import { prisma } from './db.js';

const issuer = 'gymtracker';
const audience = 'gymtracker-api';
const expiresIn = 3600;
const userFields = { id: true, displayName: true, email: true, role: true, isActive: true, createdAt: true } as const;
const credentials = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(1).max(128),
});

export function requireAuthentication(secret: string): RequestHandler {
  return async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
    const unauthorized = () => {
      res.setHeader('WWW-Authenticate', 'Bearer');
      res.status(401).json({ error: 'Authentication required' });
    };
    if (!match) { unauthorized(); return; }
    let subject: string;
    try {
      const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'], issuer, audience });
      if (typeof payload === 'string' || !z.uuid().safeParse(payload.sub).success || typeof payload.exp !== 'number') {
        unauthorized(); return;
      }
      subject = payload.sub!;
    } catch { unauthorized(); return; }
    try {
      const user = await prisma.user.findUnique({ where: { id: subject }, select: userFields });
      if (!user?.isActive) { unauthorized(); return; }
      res.locals.user = user;
      next();
    } catch (error) { next(error); }
  };
}

export function createAuthRouter(secret: string) {
  const router = Router();
  router.post('/login', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const input = credentials.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Invalid login details', fields: z.flattenError(input.error).fieldErrors });
      return;
    }
    try {
      const user = await prisma.user.findUnique({ where: { email: input.data.email } });
      if (!user || !await verify(user.passwordHash, input.data.password) || !user.isActive) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }
      const accessToken = jwt.sign({}, secret, { algorithm: 'HS256', subject: user.id, issuer, audience, expiresIn });
      const { passwordHash: _passwordHash, ...safeUser } = user;
      res.json({ accessToken, tokenType: 'Bearer', expiresIn, user: safeUser });
    } catch (error) { next(error); }
  });
  router.get('/me', requireAuthentication(secret), (_req, res) => res.json({ user: res.locals.user }));
  return router;
}
