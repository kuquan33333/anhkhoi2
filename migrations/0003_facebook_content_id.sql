-- Dedupe Facebook content across /reel/, /videos/ and query URL variants.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_items_facebook_id_unique
ON facebook_items(facebook_id)
WHERE facebook_id IS NOT NULL;
