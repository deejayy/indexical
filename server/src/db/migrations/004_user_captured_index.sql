CREATE INDEX IF NOT EXISTS idx_pages_user_captured
  ON pages(user_id, captured_at);
