import type { Request, Response, NextFunction } from 'express';
import { registry } from '../metrics/registry.js';

export function makeMetricsHandler() {
  return async (_req: Request, res: Response, _next: NextFunction): Promise<void> => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  };
}
