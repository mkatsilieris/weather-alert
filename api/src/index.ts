import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { accessEnabled } from './access.js';
import { mailConfigured } from './mail.js';
import { migrate, waitForDb } from './db.js';
import { errorHandler } from './errors.js';
import { log, requestLogger } from './log.js';
import { initPush } from './notify.js';
import { startScheduler } from './scanner.js';
import { gridPoints } from './lib/geo.js';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { pushRouter } from './routes/push.js';
import { statusRouter } from './routes/status.js';

const app = express();
app.disable('x-powered-by');
// Behind nginx (and Cloudflare): take the client IP / protocol from X-Forwarded-* headers.
app.set('trust proxy', 1);
// The SPA is served from the same origin, so only APP_URL (and localhost in dev) may call the API cross-origin.
const allowedOrigins = new Set([config.appUrl, ...(config.nodeEnv === 'production' ? [] : ['http://localhost:5173'])]);
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.has(origin)) }));
app.use(requestLogger);
app.use(express.json({ limit: '50kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/push', pushRouter);
app.use('/api', statusRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(errorHandler);

async function main() {
  if (config.nodeEnv === 'production' && config.jwtSecret === 'dev-secret-change-me') {
    log.warn('JWT_SECRET is using the default value. Set it in .env!');
  }
  await waitForDb();
  await migrate();
  await initPush();
  app.listen(config.port, () => {
    log.info({ port: config.port, env: config.nodeEnv, logLevel: config.logLevel }, 'api listening');
    const { center, radiusKm, spacingKm, intervalMin, provider } = config.scan;
    // One line that answers "is it configured?" without reading .env on the server.
    log.info(
      {
        provider,
        center,
        radiusKm,
        spacingKm,
        gridPoints: gridPoints(center, radiusKm, spacingKm).length,
        everyMin: intervalMin,
        cloudflareAccessSso: accessEnabled,
        smtp: mailConfigured,
        timeZone: config.timeZone,
      },
      'features',
    );
    if (provider === 'mock') log.warn('WEATHER_PROVIDER=mock: the rain is simulated, not real');
    startScheduler();
  });
}

main().catch((err) => {
  log.fatal({ err }, 'api failed to start');
  process.exit(1);
});

process.on('unhandledRejection', (err) => log.error({ err }, 'unhandled promise rejection'));
process.on('SIGTERM', () => {
  log.info('shutting down');
  process.exit(0);
});
