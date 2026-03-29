import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(_dir, '..');

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error'] as const);
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function envInt(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`env ${key}="${raw}" must be integer in [${min}, ${max}]`);
  }
  return n;
}

export function envLogLevel(key: string, fallback: LogLevel): LogLevel {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  if (!LOG_LEVELS.has(raw as LogLevel)) {
    throw new Error(`env ${key}="${raw}" must be one of: ${[...LOG_LEVELS].join(', ')}`);
  }
  return raw as LogLevel;
}

export type Config = typeof config;

export const config = Object.freeze({
  port: envInt('PORT', 11435, 1, 65535),
  host: process.env['HOST'] ?? '127.0.0.1',
  dbPath: process.env['DB_PATH'] ?? path.join(root, 'indexical.db'),
  spellfix1Dll: process.env['SPELLFIX1_DLL'] ?? path.join(root, 'lib', 'spellfix1'),
  migrationsDir: process.env['MIGRATIONS_DIR'] ?? path.join(_dir, 'db', 'migrations'),
  logLevel: envLogLevel('LOG_LEVEL', 'info'),
  apiVersion: 1,
  spellfixMaxWordLen: 40,
  spellfixMinWordLen: 3,
  maxFieldBytes: envInt('MAX_FIELD_BYTES', 2 * 1024 * 1024, 1024, 16 * 1024 * 1024),
  maxBodyBytes: envInt('MAX_BODY_BYTES', 4 * 1024 * 1024, 1024, 32 * 1024 * 1024),
  requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30000, 1000, 300000),
  dedupFetchMultiplier: envInt('DEDUP_FETCH_MULTIPLIER', 4, 1, 20),
  rateLimitWindowMs: envInt('RATE_LIMIT_WINDOW_MS', 60000, 1000, 600000),
  rateLimitMaxRequests: envInt('RATE_LIMIT_MAX_REQUESTS', 300, 1, 10000),
});
