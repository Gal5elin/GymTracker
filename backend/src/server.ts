import { createApp } from './app.js';
import { config } from './config.js';

const server = createApp(config.FRONTEND_ORIGIN, config.JWT_SECRET).listen(config.PORT, () => {
  console.log(`GymTracker API listening on http://localhost:${config.PORT}`);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
