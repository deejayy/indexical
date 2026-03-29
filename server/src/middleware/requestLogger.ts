import type { Request, Response, NextFunction } from 'express';
import { logger } from '../logger.js';
import { counters, histograms } from '../metrics/collectors.js';

export function normalizeRoute(req: Request): string {
  if (req.route?.path) return req.route.path as string;
  return '/*';
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const traceHeader = req.headers['traceparent'] as string | undefined;
  const [, traceId, spanId] =
    traceHeader?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-/) ?? [];

  res.on('finish', () => {
    const latency = Date.now() - start;
    const route = normalizeRoute(req);
    const status = res.statusCode;

    logger.info({
      msg: 'http request',
      http_method: req.method,
      http_path: req.path,
      http_route: route,
      http_status: status,
      latency_ms: latency,
      trace_id: traceId,
      span_id: spanId,
      request_id: req.headers['x-request-id'],
    });

    counters.httpRequests.inc({
      method: req.method,
      route,
      status: String(status),
    });
    histograms.httpLatency.observe({ method: req.method, route }, latency);
  });

  next();
}
