CREATE TABLE IF NOT EXISTS pages (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  url              TEXT    NOT NULL,
  domain           TEXT,
  lang             TEXT,
  title            TEXT,
  content          TEXT,
  content_markdown TEXT,
  excerpt          TEXT,
  author           TEXT,
  site_name        TEXT,
  stable_hash      TEXT    NOT NULL,
  exact_hash       TEXT    NOT NULL,
  word_count       INTEGER,
  char_count       INTEGER,
  published_time   TEXT,
  modified_time    TEXT,
  favicon          TEXT,
  capture_reason   TEXT,
  user_id          TEXT    NOT NULL,
  extension_version TEXT,
  request_id       TEXT,
  captured_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_pages_url        ON pages(url);
CREATE INDEX IF NOT EXISTS idx_pages_user_id    ON pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_stable_hash ON pages(stable_hash);
CREATE INDEX IF NOT EXISTS idx_pages_captured_at ON pages(captured_at);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  title,
  content,
  excerpt,
  author,
  site_name,
  content='pages',
  content_rowid='id',
  tokenize='porter ascii'
);

CREATE TRIGGER IF NOT EXISTS pages_fts_ai
AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, title, content, excerpt, author, site_name)
  VALUES (new.id, new.title, new.content, new.excerpt, new.author, new.site_name);
END;

CREATE TRIGGER IF NOT EXISTS pages_fts_ad
AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, title, content, excerpt, author, site_name)
  VALUES ('delete', old.id, old.title, old.content, old.excerpt, old.author, old.site_name);
END;

CREATE TRIGGER IF NOT EXISTS pages_fts_au
AFTER UPDATE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, title, content, excerpt, author, site_name)
  VALUES ('delete', old.id, old.title, old.content, old.excerpt, old.author, old.site_name);
  INSERT INTO pages_fts(rowid, title, content, excerpt, author, site_name)
  VALUES (new.id, new.title, new.content, new.excerpt, new.author, new.site_name);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS spellfix_vocab USING spellfix1;
