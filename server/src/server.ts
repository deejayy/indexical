import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { openDb } from './db/connection.js';
import { gauges } from './metrics/registry.js';

function start(): void {
  const handle = openDb(config, logger);
  gauges.up.set(1);

  const app = createApp({
    db: handle.db,
    config,
    spellfixAvailable: handle.spellfixAvailable,
  });

  const server = app.listen(config.port, config.host, () => {
    logger.info({
      msg: 'server started',
      host: config.host,
      port: config.port,
      db: config.dbPath,
    });
  });

  server.requestTimeout = config.requestTimeoutMs;

  function shutdown(signal: string): void {
    logger.info({ msg: 'shutdown', signal });
    gauges.up.set(0);
    server.close(() => {
      handle.close();
      process.exit(0);
    });
    setTimeout(() => {
      server.closeAllConnections();
    }, 3000).unref();
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGTERM', () => { shutdown('SIGTERM'); });
  process.on('SIGINT', () => { shutdown('SIGINT'); });
}

try {
  start();
} catch (err) {
  logger.fatal({ err, msg: 'startup failed' });
  process.exit(1);
}
