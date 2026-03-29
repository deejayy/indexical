import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../config.js';

export function makeApiVersionHeader(cfg: Pick<Config, 'apiVersion'>) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-API-Version', String(cfg.apiVersion));
    next();
  };
}
