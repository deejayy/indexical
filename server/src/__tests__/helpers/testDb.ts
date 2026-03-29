import Database from 'better-sqlite3';
import type { IngestBody } from '../../types.js';

export function setupTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE pages (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      url              TEXT NOT NULL,
      domain           TEXT,
      lang             TEXT,
      title            TEXT,
      content          TEXT,
      content_markdown TEXT,
      excerpt          TEXT,
      author           TEXT,
      site_name        TEXT,
      stable_hash      TEXT NOT NULL,
      exact_hash       TEXT NOT NULL,
      word_count       INTEGER,
      char_count       INTEGER,
      published_time   TEXT,
      modified_time    TEXT,
      favicon          TEXT,
      capture_reason   TEXT,
      user_id          TEXT NOT NULL,
      extension_version TEXT,
      request_id       TEXT,
      captured_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  db.exec(`CREATE UNIQUE INDEX idx_pages_url_hash_user ON pages(url, stable_hash, user_id)`);

  db.exec(`
    CREATE VIRTUAL TABLE pages_fts USING fts5(
      title, content, excerpt, author, site_name,
      content='pages', content_rowid='id', tokenize='porter unicode61'
    )
  `);

  db.exec(`
    CREATE TRIGGER pages_fts_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, content, excerpt, author, site_name)
      VALUES (new.id, new.title, new.content, new.excerpt, new.author, new.site_name);
    END
  `);

  db.exec(`
    CREATE TRIGGER pages_fts_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content, excerpt, author, site_name)
      VALUES ('delete', old.id, old.title, old.content, old.excerpt, old.author, old.site_name);
    END
  `);

  db.exec(`
    CREATE TRIGGER pages_fts_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content, excerpt, author, site_name)
      VALUES ('delete', old.id, old.title, old.content, old.excerpt, old.author, old.site_name);
      INSERT INTO pages_fts(rowid, title, content, excerpt, author, site_name)
      VALUES (new.id, new.title, new.content, new.excerpt, new.author, new.site_name);
    END
  `);

  return db;
}

export function makeBody(overrides: Partial<IngestBody> = {}): IngestBody {
  return {
    url: 'https://example.com/page',
    domain: 'example.com',
    lang: 'en',
    title: 'Test Page Title',
    content: 'This is the main content of the test page about programming',
    contentMarkdown: '# Test',
    excerpt: 'A test page',
    author: 'Author Name',
    siteName: 'Example Site',
    stableHash: 'hash123',
    exactHash: 'exact456',
    wordCount: 12,
    charCount: 60,
    publishedTime: null,
    modifiedTime: null,
    favicon: null,
    captureReason: 'initial',
    userId: 'user1',
    extensionVersion: '1.0.0',
    requestId: 'req1',
    ...overrides,
  };
}
