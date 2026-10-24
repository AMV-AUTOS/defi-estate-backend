import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Middleware that ensures every request has an `x-request-id`, echoes it back
 * on the response, and logs a single structured JSON line once the response
 * has been sent.
 *
 * Only method, path, status and duration are logged. Request bodies, headers
 * (which may contain secrets) and any admin secret are never logged.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && incoming.trim().length > 0
      ? incoming.trim()
      : randomUUID();

  // Expose the id to downstream handlers and echo it back to the client.
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    const entry = {
      level: 'info',
      msg: 'request',
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
    };

    // Single JSON line; no bodies, headers or secrets included.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  });

  next();
}

export default requestLogger;