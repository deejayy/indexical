import fs from 'node:fs';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import type { Logger } from 'pino';

export function runMigrations(db: Database, migrationsDir: string, log: Logger): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT NOT NULL PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(
    (
      db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>
    ).map((r) => r.name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const downFile = file.replace(/\.sql$/, '.down.sql');
    if (!fs.existsSync(path.join(migrationsDir, downFile))) {
      log.warn({ msg: 'missing down migration', migration: file, expected: downFile });
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations(name) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    log.info({ msg: 'migration applied', migration: file });
  }
}
