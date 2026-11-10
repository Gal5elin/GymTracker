import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
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
    let sessionId: string | undefined;
    try {
      const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'], issuer, audience });
      if (typeof payload === 'string' || !z.uuid().safeParse(payload.sub).success || !z.uuid().safeParse(payload.sid).success || typeof payload.exp !== 'number') {
        unauthorized(); return;
      }
      subject = payload.sub!;
      sessionId = payload.sid as string;
    } catch { unauthorized(); return; }
    try {
      if (sessionId) {
        const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
        if (!session || session.userId !== subject || session.expiresAt.getTime() <= Date.now()) { unauthorized(); return; }
      }
      const user = await prisma.user.findUnique({ where: { id: subject }, select: userFields });
      if (!user?.isActive) { unauthorized(); return; }
      res.locals.user = user;
      next();
    } catch (error) { next(error); }
  };
}

const sessionLifetime = 30 * 24 * 60 * 60 * 1000;
const cookieName = 'gymtracker_session';
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function cookieToken(cookie: string | undefined) {
  return cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}

export function createAuthRouter(secret: string, secureCookies = false) {
  const router = Router();
  const cookieOptions = { httpOnly: true, secure: secureCookies, sameSite: 'strict' as const, path: '/api/auth' };
  function accessResponse(user: { id: string }, sessionId: string) {
    const accessToken = jwt.sign({ sid: sessionId }, secret, { algorithm: 'HS256', subject: user.id, issuer, audience, expiresIn });
    return { accessToken, tokenType: 'Bearer', expiresIn, user };
  }
  router.post('/session', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = cookieToken(req.get('Cookie'));
    if (!token) { res.status(401).json({ error: 'Authentication required' }); return; }
    try {
      const session = await prisma.authSession.findUnique({ where: { tokenHash: digest(token) }, include: { user: { select: userFields } } });
      if (!session || session.expiresAt.getTime() <= Date.now() || !session.user.isActive) {
        res.clearCookie(cookieName, cookieOptions);
        res.status(401).json({ error: 'Authentication required' }); return;
      }
      res.json(accessResponse(session.user, session.id));
    } catch (error) { next(error); }
  });
  router.post('/logout', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const token = cookieToken(req.get('Cookie'));
      if (token) await prisma.authSession.deleteMany({ where: { tokenHash: digest(token) } });
      res.clearCookie(cookieName, cookieOptions);
      res.sendStatus(204);
    } catch (error) { next(error); }
  });
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
      const token = randomBytes(32).toString('base64url');
      const previous = cookieToken(req.get('Cookie'));
      const session = await prisma.$transaction(async db => {
        if (previous) await db.authSession.deleteMany({ where: { tokenHash: digest(previous) } });
        await db.authSession.deleteMany({ where: { userId: user.id, expiresAt: { lte: new Date() } } });
        return db.authSession.create({ data: { userId: user.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + sessionLifetime) } });
      });
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetime });
      const { passwordHash: _passwordHash, ...safeUser } = user;
      res.json(accessResponse(safeUser, session.id));
    } catch (error) { next(error); }
  });
  router.get('/me', requireAuthentication(secret), (_req, res) => res.json({ user: res.locals.user }));
  return router;
}
