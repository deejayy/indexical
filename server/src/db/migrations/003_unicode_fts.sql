DROP TRIGGER IF EXISTS pages_fts_au;
DROP TRIGGER IF EXISTS pages_fts_ad;
DROP TRIGGER IF EXISTS pages_fts_ai;
DROP TABLE IF EXISTS pages_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  title,
  content,
  excerpt,
  author,
  site_name,
  content='pages',
  content_rowid='id',
  tokenize='porter unicode61'
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

INSERT INTO pages_fts(rowid, title, content, excerpt, author, site_name)
SELECT id, title, content, excerpt, author, site_name FROM pages;
