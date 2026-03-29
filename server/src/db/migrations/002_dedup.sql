CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_url_hash_user
  ON pages(url, stable_hash, user_id);

CREATE TABLE IF NOT EXISTS spellfix_words (
  word TEXT NOT NULL PRIMARY KEY
);
