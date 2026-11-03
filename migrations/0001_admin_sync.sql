-- Anh Khoi AI Media runtime schema
-- Cloudflare D1: anhkhoi-content
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS facebook_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  facebook_id TEXT,
  permalink TEXT,
  item_type TEXT NOT NULL DEFAULT 'unknown',
  caption TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  thumbnail_url TEXT,
  r2_thumbnail_key TEXT,
  embed_url TEXT,
  embed_status TEXT NOT NULL DEFAULT 'unknown',
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'published',
  fingerprint TEXT,
  raw_json TEXT,
  UNIQUE(permalink),
  UNIQUE(fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_fb_items_published ON facebook_items(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_items_type ON facebook_items(item_type, status);
CREATE INDEX IF NOT EXISTS idx_fb_items_last_seen ON facebook_items(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS facebook_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES facebook_items(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'image',
  source_url TEXT NOT NULL,
  r2_key TEXT,
  width INTEGER,
  height INTEGER,
  ordinal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, source_url)
);
CREATE INDEX IF NOT EXISTS idx_fb_media_item ON facebook_media(item_id, ordinal);

CREATE TABLE IF NOT EXISTS manual_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body_markdown TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'vi',
  category TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_posts_status ON manual_posts(status, published_at DESC);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger_type TEXT NOT NULL DEFAULT 'cron',
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  discovered_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  blocked_reason TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER REFERENCES sync_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  url TEXT,
  code TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sync_errors_run ON sync_errors(sync_run_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The initial admin password hash is intentionally not committed.
-- It is seeded directly into D1 during provisioning.

INSERT OR IGNORE INTO settings(key,value) VALUES
('facebook_profile_url','https://www.facebook.com/profile.php?id=61595505020148'),
('facebook_reels_url','https://www.facebook.com/profile.php?id=61595505020148&sk=reels_tab'),
('facebook_sync_enabled','true'),
('facebook_auto_publish','true'),
('facebook_feed_visible','false'),
('facebook_shadow_mode','true'),
('crawler_interval_minutes','30'),
('crawler_max_scrolls','6'),
('crawler_max_items_per_run','20'),
('admin_manual_posts_visible','true'),
('sync_failure_backoff_minutes','120');
