import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../config.js';

interface Window {
  count: number;
  resetAt: number;
}

export function makeRateLimiter(cfg: Pick<Config, 'rateLimitWindowMs' | 'rateLimitMaxRequests'>) {
  const clients = new Map<string, Window>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, win] of clients) {
      if (win.resetAt <= now) clients.delete(key);
    }
  }, cfg.rateLimitWindowMs).unref();

  function limiter(req: Request, res: Response, next: NextFunction): void {
    const key = req.headers['x-api-key'] as string | undefined ?? req.ip ?? 'unknown';
    const now = Date.now();

    let win = clients.get(key);
    if (!win || win.resetAt <= now) {
      win = { count: 0, resetAt: now + cfg.rateLimitWindowMs };
      clients.set(key, win);
    }

    win.count++;
    res.setHeader('X-RateLimit-Limit', cfg.rateLimitMaxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, cfg.rateLimitMaxRequests - win.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(win.resetAt / 1000));

    if (win.count > cfg.rateLimitMaxRequests) {
      res.status(429).json({
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      });
      return;
    }

    next();
  }

  limiter.destroy = () => { clearInterval(cleanup); };
  return limiter;
}
