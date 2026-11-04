-- Unified editorial posts: preserve both language versions and legacy URLs.
-- Apply once to D1 before deploying code that selects these columns.
ALTER TABLE manual_posts ADD COLUMN title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_posts ADD COLUMN excerpt_en TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_posts ADD COLUMN body_markdown_en TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_posts ADD COLUMN legacy_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_manual_posts_legacy_slug ON manual_posts(legacy_slug);
