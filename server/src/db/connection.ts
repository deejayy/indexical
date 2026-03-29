import Database from 'better-sqlite3';
import type { Config } from '../config.js';
import type { Logger } from 'pino';
import { runMigrations } from './migrate.js';

export interface DbHandle {
  db: Database.Database;
  spellfixAvailable: boolean;
  close(): void;
}

export function openDb(cfg: Pick<Config, 'dbPath' | 'spellfix1Dll' | 'migrationsDir'>, log: Logger): DbHandle {
  const db = new Database(cfg.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  let spellfixAvailable = false;
  try {
    db.loadExtension(cfg.spellfix1Dll);
    spellfixAvailable = true;
    log.info({ msg: 'spellfix1 loaded' });
  } catch (err) {
    log.warn({ msg: 'spellfix1 load failed', err });
  }

  runMigrations(db, cfg.migrationsDir, log);

  return {
    db,
    spellfixAvailable,
    close() {
      db.close();
      log.info({ msg: 'database closed' });
    },
  };
}
