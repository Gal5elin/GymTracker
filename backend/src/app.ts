import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { registrationRouter } from './registration.js';

export function createApp(frontendOrigin: string) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', registrationRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 400 ? 'Invalid JSON' : status === 413 ? 'Request too large' : 'Internal server error' });
  };
  app.use(handleError);
  return app;
}
