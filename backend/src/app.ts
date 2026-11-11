import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { HttpError, requireRoles } from './permissions.js';
import { createAuthRouter, requireAuthentication } from './auth.js';
import { exerciseCatalogRouter } from './program-exercises.js';
import { progressRouter } from './progress.js';
import { programsRouter } from './programs.js';
import { workoutsRouter } from './workouts.js';
import { trainerLinksRouter } from './trainer-links.js';
import { trainerResultsRouter } from './trainer-results.js';
import { assignmentsRouter } from './assignments.js';
import { registrationRouter } from './registration.js';

export function createApp(frontendOrigin: string, jwtSecret: string, secureCookies = false) {
  if (jwtSecret.length < 32) throw new Error('JWT secret must contain at least 32 characters');
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: frontendOrigin, credentials: true }));
  // Cookie-backed authentication mutations must originate from our frontend.
  app.use('/api/auth', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        ((req.get('Origin') && req.get('Origin') !== frontendOrigin) || req.get('Sec-Fetch-Site') === 'cross-site')) {
      res.status(403).json({ error: 'Untrusted request origin' }); return;
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', registrationRouter);
  app.use('/api/auth', createAuthRouter(jwtSecret, secureCookies));
  // Mount future feature routers after these namespace guards.
  app.use(['/api/programs', '/api/assignments', '/api/workout-sessions', '/api/progress', '/api/trainer-links', '/api/trainer/members'],
    requireAuthentication(jwtSecret), requireRoles('MEMBER', 'TRAINER'));
  app.use('/api/trainer/members', trainerResultsRouter);
  app.use('/api/assignments', assignmentsRouter);
  app.use('/api/trainer-links', trainerLinksRouter);
  app.use('/api/programs', programsRouter);
  app.use('/api/progress', progressRouter);
  app.use('/api/workout-sessions', workoutsRouter);
  app.use('/api/exercises', requireAuthentication(jwtSecret), exerciseCatalogRouter);
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
