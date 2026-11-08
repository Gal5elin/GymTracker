import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { HttpError, requireRoles } from './permissions.js';
import { createAuthRouter, requireAuthentication } from './auth.js';
import { registrationRouter } from './registration.js';

export function createApp(frontendOrigin: string, jwtSecret: string) {
  if (jwtSecret.length < 32) throw new Error('JWT secret must contain at least 32 characters');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', registrationRouter);
  app.use('/api/auth', createAuthRouter(jwtSecret));
  // Mount future feature routers after these namespace guards.
  app.use(['/api/programs', '/api/assignments', '/api/workout-sessions', '/api/progress', '/api/trainer-links'],
    requireAuthentication(jwtSecret), requireRoles('MEMBER', 'TRAINER'));
  app.use('/api/exercises', requireAuthentication(jwtSecret));
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(handleError);
  return app;
}

export const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  const status = error instanceof HttpError ? error.status : error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
  if (status === 500) console.error(error);
  if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(status).json({ error: error instanceof HttpError ? error.message : status === 400 ? 'Invalid JSON' : status === 413 ? 'Request too large' : 'Internal server error' });
};
