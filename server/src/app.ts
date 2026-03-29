import express from 'express';
import cors from 'cors';
import type { Database } from 'better-sqlite3';
import type { Config } from './config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { makeApiVersionHeader } from './middleware/apiVersion.js';
import { makeRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { makeIngestHandler } from './routes/ingest.js';
import { makeSearchHandler } from './routes/search.js';
import { makeHealthHandler } from './routes/health.js';
import { makeMetricsHandler } from './routes/metrics.js';
import { makeStatsHandler } from './routes/stats.js';
import { makePageMarkdownHandler } from './routes/page.js';

export interface AppDeps {
  db: Database;
  config: Config;
  spellfixAvailable: boolean;
}

export function createApp(deps: AppDeps): express.Application {
  const app = express();
  const jsonBody = express.json({ limit: deps.config.maxBodyBytes });

  app.use(cors());
  app.use(makeApiVersionHeader(deps.config));
  app.use(requestLogger);
  app.use(makeRateLimiter(deps.config));

  app.post('/ingest', jsonBody, makeIngestHandler(deps));
  app.post('/search', jsonBody, makeSearchHandler(deps));
  app.get('/pages/:id/markdown', makePageMarkdownHandler(deps));
  app.get('/health', makeHealthHandler(deps));
  app.get('/metrics', makeMetricsHandler());
  app.get('/stats', makeStatsHandler(deps));

  app.use(errorHandler);

  return app;
}
