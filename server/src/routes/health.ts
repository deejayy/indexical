import type { Request, Response, NextFunction } from 'express';
import type { AppDeps } from '../app.js';
import { AppError } from '../errors.js';

export function makeHealthHandler(deps: AppDeps) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    try {
      deps.db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        version: deps.config.apiVersion,
        ts: new Date().toISOString(),
      });
    } catch {
      next(new AppError(503, 'Database unavailable', 'HEALTH_CHECK_FAILED'));
    }
  };
}
