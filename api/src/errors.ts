import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { errorMessageKey } from './log.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (msg = 'Δεν βρέθηκε') => new HttpError(404, msg);
export const forbidden = (msg = 'Δεν έχετε δικαίωμα') => new HttpError(403, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.locals[errorMessageKey] = err.message;
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const path = first?.path?.join('.');
    const prefix = path ? `${path}: ` : '';
    const message = `${prefix}${first?.message ?? 'Μη έγκυρα δεδομένα'}`;
    res.locals[errorMessageKey] = message;
    res.status(400).json({ error: message });
    return;
  }
  // Errors raised by express itself (malformed JSON, body over the size limit, ...) carry a 4xx
  // status: answer with it and note the reason, without the noise of a stack trace.
  const e = err as Error & { status?: number; statusCode?: number; type?: string };
  const status = e?.status ?? e?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const message = e.type === 'entity.parse.failed' ? 'Μη έγκυρο JSON' : e.message;
    res.locals[errorMessageKey] = message;
    res.status(status).json({ error: message });
    return;
  }
  // Unexpected failure: full stack in the logs, generic message to the client.
  res.locals[errorMessageKey] = e?.message ?? String(err);
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Κάτι πήγε στραβά' });
}
