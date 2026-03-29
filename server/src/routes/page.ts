import type { Request, Response, NextFunction } from 'express';
import type { AppDeps } from '../app.js';
import { badRequest, unauthorized, notFound } from '../errors.js';

export function makePageMarkdownHandler(deps: AppDeps) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.headers['x-api-key'];
    if (typeof userId !== 'string' || userId.length === 0) {
      next(unauthorized('X-API-Key header required'));
      return;
    }

    const rawId = req.params['id'];
    const id = parseInt(typeof rawId === 'string' ? rawId : '', 10);
    if (isNaN(id)) {
      next(badRequest('id must be an integer'));
      return;
    }

    const row = deps.db
      .prepare('SELECT content_markdown FROM pages WHERE id = ? AND user_id = ?')
      .get(id, userId) as { content_markdown: string | null } | undefined;

    if (!row) {
      next(notFound('Not found'));
      return;
    }

    res.json({ contentMarkdown: row.content_markdown });
  };
}
