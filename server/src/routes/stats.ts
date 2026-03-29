import type { Request, Response, NextFunction } from 'express';
import type { AppDeps } from '../app.js';

interface StatsRow {
  total_pages: number;
  distinct_domains: number;
  distinct_users: number;
  earliest: string | null;
  latest: string | null;
  avg_word_count: number | null;
  total_words: number | null;
}

export function makeStatsHandler(deps: AppDeps) {
  return (_req: Request, res: Response, _next: NextFunction): void => {
    const row = deps.db
      .prepare(
        `SELECT
          COUNT(*)                    AS total_pages,
          COUNT(DISTINCT domain)      AS distinct_domains,
          COUNT(DISTINCT user_id)     AS distinct_users,
          MIN(captured_at)            AS earliest,
          MAX(captured_at)            AS latest,
          AVG(word_count)             AS avg_word_count,
          SUM(word_count)             AS total_words
        FROM pages`,
      )
      .get() as StatsRow;

    res.json({
      totalPages: row.total_pages,
      distinctDomains: row.distinct_domains,
      distinctUsers: row.distinct_users,
      earliest: row.earliest,
      latest: row.latest,
      avgWordCount: row.avg_word_count !== null ? Math.round(row.avg_word_count) : null,
      totalWords: row.total_words,
      ts: new Date().toISOString(),
    });
  };
}
