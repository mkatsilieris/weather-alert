import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { pino, type Logger } from 'pino';
import { config } from './config.js';

/**
 * Application logger. One JSON line per event on stdout, which `docker compose logs` collects
 * (log rotation is configured in docker-compose.yml). In development the lines are pretty-printed.
 *
 *   LOG_LEVEL=debug|info|warn|error   (default: info)
 *
 * Fields on every request line:
 *   reqId    short id, also returned as the X-Request-Id response header
 *   user     id of the signed-in user (absent for anonymous calls)
 *   ip       client address as nginx / Cloudflare forwarded it
 *   method, url, status, ms
 *   err      the error message for 4xx/5xx responses
 */
export const log: Logger = pino({
  level: config.logLevel,
  base: undefined, // no pid / hostname noise - there is one process per container
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: ['password', 'token', 'authorization'], remove: true },
  transport:
    config.nodeEnv === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'reqId' } },
});

declare global {
  namespace Express {
    interface Request {
      /** Logger bound to this request (carries reqId); use it inside route handlers. */
      log: Logger;
    }
  }
}

/** res.locals key the error handler fills so the request line can carry the reason for a 4xx/5xx. */
export const errorMessageKey = 'errorMessage';

/** Successful calls to these paths are not logged (docker polls /api/health every 30s). */
const quietPaths = new Set(['/api/health']);

/** Logs one line per finished request, with the user that made it. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const reqId = randomUUID().slice(0, 8);
  const started = process.hrtime.bigint();
  req.log = log.child({ reqId });
  res.setHeader('X-Request-Id', reqId);

  res.on('finish', () => {
    if (quietPaths.has(req.path) && res.statusCode < 400) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const fields = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      user: req.user?.id,
      ip: req.ip,
      err: res.locals[errorMessageKey] as string | undefined,
    };
    const msg = `${req.method} ${req.originalUrl} ${res.statusCode}`;
    if (res.statusCode >= 500) req.log.error(fields, msg);
    else if (res.statusCode >= 400) req.log.warn(fields, msg);
    else req.log.info(fields, msg);
  });

  next();
}
