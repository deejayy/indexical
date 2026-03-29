import type { Request, Response, NextFunction } from 'express';
import type { AppDeps } from '../app.js';
import { ingestPage } from '../services/ingest.service.js';
import type { IngestBody } from '../types.js';
import { counters, histograms } from '../metrics/collectors.js';
import { logger } from '../logger.js';
import { badRequest, unauthorized, forbidden } from '../errors.js';

const REQUIRED_STRINGS: (keyof IngestBody)[] = [
  'url', 'domain', 'lang', 'title', 'content',
  'stableHash', 'exactHash',
  'userId', 'extensionVersion', 'requestId',
];

const NULLABLE_STRINGS: (keyof IngestBody)[] = [
  'contentMarkdown', 'excerpt', 'author', 'siteName',
  'publishedTime', 'modifiedTime', 'favicon',
];

const TEXT_FIELDS: (keyof IngestBody)[] = [
  'content', 'contentMarkdown', 'title', 'excerpt', 'author',
];

const OPTIONAL_TYPES: [string, string][] = [
  ['wordCount', 'number'],
  ['charCount', 'number'],
];

const CAPTURE_REASONS = new Set(['initial', 'mutation']);

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function hasValidOptionals(b: Record<string, unknown>): boolean {
  return OPTIONAL_TYPES.every(
    ([k, t]) => !(k in b) || b[k] === undefined || typeof b[k] === t,
  );
}

function hasValidNullableStrings(b: Record<string, unknown>): boolean {
  return NULLABLE_STRINGS.every(
    (k) => !(k in b) || b[k] === null || b[k] === undefined || typeof b[k] === 'string',
  );
}

function hasValidIso8601Dates(b: Record<string, unknown>): boolean {
  const keys = ['publishedTime', 'modifiedTime'] as const;
  return keys.every((k) => {
    const v = b[k];
    return v === null || v === undefined || (typeof v === 'string' && ISO8601_RE.test(v));
  });
}

function validate(body: unknown): body is IngestBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  if (!REQUIRED_STRINGS.every((k) => typeof b[k] === 'string')) return false;
  if (typeof b['captureReason'] !== 'string' || !CAPTURE_REASONS.has(b['captureReason'])) return false;
  if (!hasValidNullableStrings(b)) return false;
  if (!hasValidIso8601Dates(b)) return false;
  return hasValidOptionals(b);
}

function checkFieldSizes(body: IngestBody, maxBytes: number): string | null {
  for (const field of TEXT_FIELDS) {
    const val = body[field];
    if (typeof val === 'string' && Buffer.byteLength(val, 'utf8') > maxBytes) {
      return field;
    }
  }
  return null;
}

export function makeIngestHandler(deps: AppDeps) {
  const spellfixCfg = {
    minWordLen: deps.config.spellfixMinWordLen,
    maxWordLen: deps.config.spellfixMaxWordLen,
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();

    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey !== 'string' || apiKey.length === 0) {
      counters.ingestErrors.inc({ reason: 'auth' });
      next(unauthorized('X-API-Key header required'));
      return;
    }

    const body = req.body as unknown;
    if (!validate(body)) {
      counters.ingestErrors.inc({ reason: 'validation' });
      next(badRequest('Missing or invalid required fields'));
      return;
    }

    if (body.userId !== apiKey) {
      counters.ingestErrors.inc({ reason: 'auth' });
      next(forbidden('userId does not match X-API-Key'));
      return;
    }

    const oversized = checkFieldSizes(body, deps.config.maxFieldBytes);
    if (oversized) {
      counters.ingestErrors.inc({ reason: 'validation' });
      next(badRequest(`Field "${oversized}" exceeds ${deps.config.maxFieldBytes} bytes`));
      return;
    }

    try {
      const result = ingestPage(
        deps.db, body, deps.spellfixAvailable, spellfixCfg,
        logger, { spellfixErrors: counters.spellfixErrors },
      );
      counters.ingestTotal.inc();
      histograms.ingestLatency.observe(Date.now() - start);
      res.json({ ok: true, skipped: result === 'duplicate' });
    } catch (err) {
      counters.ingestErrors.inc({ reason: 'internal' });
      histograms.ingestLatency.observe(Date.now() - start);
      next(err);
    }
  };
}
