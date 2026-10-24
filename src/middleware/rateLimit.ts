import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60 * 1000;

const DEFAULT_LIMIT = 60;

function parseLimit(): number {
  const raw = process.env.RATE_LIMIT_PER_MINUTE;
  if (raw === undefined || raw === '') {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return parsed;
}

const store = new Map<string, RateLimitEntry>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0].trim();
    if (first.length > 0) {
      return first;
    }
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function isExempt(req: Request): boolean {
  const path = req.path || req.url || '';
  return path === '/health' || path.startsWith('/health/');
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  if (isExempt(req)) {
    next();
    return;
  }

  const limit = parseLimit();
  const now = Date.now();
  const key = getClientIp(req);

  let entry = store.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    store.set(key, entry);
  }

  entry.count += 1;

  const remaining = Math.max(0, limit - entry.count);
  const resetSeconds = Math.max(0, Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000));

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(resetSeconds));

  if (entry.count > limit) {
    res.setHeader('Retry-After', String(resetSeconds));
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.',
      },
    });
    return;
  }

  next();
}

export function resetRateLimitStore(): void {
  store.clear();
}

export default rateLimit;