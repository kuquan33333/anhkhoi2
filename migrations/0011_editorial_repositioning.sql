-- Editorial repositioning for Anh Khoi AI Media.
-- Production D1 was backed up to manual_posts_backup_20261105_editorial before this migration.
-- Additive only: no existing column or row is removed.
ALTER TABLE manual_posts ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE manual_posts ADD COLUMN media_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE manual_posts ADD COLUMN editorial_action TEXT NOT NULL DEFAULT 'KEEP';
ALTER TABLE manual_posts ADD COLUMN editorial_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_posts ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE manual_posts ADD COLUMN archived_at TEXT;
