-- Remove known false-positive Facebook photo navigation entries created before
-- DOM-card validation. They all resolve to the generic Facebook Watch page,
-- share the same "Tab Video..." description, and have no cached image.
DELETE FROM facebook_items
WHERE item_type='photo'
  AND r2_thumbnail_key IS NULL
  AND caption LIKE 'Tab Video là nơi để cùng thưởng thức các video và chương trình.%';

-- A deeper scroll gives the public tabs more time to expose older cards.
INSERT INTO settings(key,value,updated_at)
VALUES('crawler_max_scrolls','14',datetime('now'))
ON CONFLICT(key) DO UPDATE SET value='14',updated_at=datetime('now');
