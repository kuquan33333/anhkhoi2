-- Back off Facebook metadata enrichment per item so unavailable Reels do not block the queue.
ALTER TABLE facebook_items ADD COLUMN enrich_fail_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facebook_items ADD COLUMN next_enrich_at TEXT;
CREATE INDEX IF NOT EXISTS idx_fb_items_enrich_next ON facebook_items(next_enrich_at, enrich_fail_count);
