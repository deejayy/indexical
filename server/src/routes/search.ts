import type { Request, Response, NextFunction } from 'express';
import type { AppDeps } from '../app.js';
import { searchPages } from '../services/search.service.js';
import type { SearchBody } from '../types.js';
import { counters, histograms } from '../metrics/collectors.js';
import { logger } from '../logger.js';
import { badRequest, unauthorized } from '../errors.js';

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIso8601(v: unknown): v is string {
  return typeof v === 'string' && ISO8601_RE.test(v);
}

function hasValidOptionalDate(b: Record<string, unknown>, key: string): boolean {
  return !(key in b) || b[key] === undefined || isIso8601(b[key]);
}

function validate(body: unknown): body is SearchBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b['query'] !== 'string' || b['query'].length === 0) return false;
  if (typeof b['k'] !== 'number' || b['k'] <= 0) return false;
  return hasValidOptionalDate(b, 'from') && hasValidOptionalDate(b, 'to');
}

export function makeSearchHandler(deps: AppDeps) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    const userId = req.headers['x-api-key'];
    if (typeof userId !== 'string' || userId.length === 0) {
      counters.searchErrors.inc({ reason: 'auth' });
      next(unauthorized('X-API-Key header required'));
      return;
    }

    const body = req.body as unknown;
    if (!validate(body)) {
      counters.searchErrors.inc({ reason: 'validation' });
      next(badRequest('query (string), k (number > 0) required; from/to must be ISO 8601 if provided'));
      return;
    }

    const opts: { userId: string; from?: string; to?: string } = { userId };
    if (body.from !== undefined) opts.from = body.from;
    if (body.to !== undefined) opts.to = body.to;

    try {
      const response = searchPages(
        deps.db, body.query, body.k, opts, deps.config.dedupFetchMultiplier,
        logger, { spellfixErrors: counters.spellfixErrors },
      );
      counters.searchTotal.inc();
      histograms.searchLatency.observe(Date.now() - start);
      res.json(response);
    } catch (err) {
      counters.searchErrors.inc({ reason: 'internal' });
      histograms.searchLatency.observe(Date.now() - start);
      next(err);
    }
  };
}
