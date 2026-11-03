
-- Security additions applied after 0001.
ALTER TABLE sessions ADD COLUMN csrf_token_hash TEXT;
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_key TEXT NOT NULL,
  username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time ON login_attempts(ip_key, created_at DESC);
