-- Editorial taxonomy/status mapping applied to production on 2026-11-05.
-- Requires 0011_editorial_repositioning.sql. Updates are idempotent and preserve all rows.

-- Public posts that no longer fit the specialist positioning.
UPDATE manual_posts
SET status='archived', editorial_action='ARCHIVE',
    editorial_notes='Archive 2026-11-05: thời sự/chính sách/địa chính trị hoặc tin hành chính không phù hợp định vị website cá nhân chuyên đề.',
    archived_at=COALESCE(archived_at,datetime('now'))
WHERE id IN (3,64,66,70,72,73,74,78,79,88,90,91,96,97,98,99);

-- Drafts archived after the full editorial audit.
UPDATE manual_posts
SET status='archived', editorial_action='ARCHIVE',
    editorial_notes='Archive 2026-11-05 sau audit: chủ đề quá thời sự/chính trị/địa chính trị/pháp lý thuần tin hoặc lệch định vị mới.',
    archived_at=COALESCE(archived_at,datetime('now'))
WHERE id IN (16,17,18,22,23,26,27,28,29,31,32,34,35,36,49,55,58,60,61,62);

-- Duplicate drafts are retained for audit history, not deleted.
UPDATE manual_posts
SET status='archived', editorial_action='REMOVE_DUPLICATE',
    editorial_notes='Bản draft trùng chủ đề với bài published đã được biên soạn sâu hơn; giữ dữ liệu để đối chiếu, không hiển thị công khai.',
    archived_at=COALESCE(archived_at,datetime('now'))
WHERE id IN (37,51,59);

-- Published taxonomy mapping.
UPDATE manual_posts SET category='Công nghệ & AI', editorial_action='REWRITE' WHERE id IN (2,5,6,7,8,9,11,12,14);
UPDATE manual_posts SET category='Công nghệ & AI', editorial_action='MOVE' WHERE id=10;
UPDATE manual_posts SET category='Văn hóa & Sáng tạo', editorial_action='MOVE' WHERE id IN (4,13,102,103,104);
UPDATE manual_posts SET category='Học tập & Kỹ năng số', editorial_action='MOVE' WHERE id IN (15,77,80,81,87,89);
UPDATE manual_posts SET category='Sức khỏe & Đời sống', editorial_action='MOVE' WHERE id IN (63,65,67,75,82,83,84,85,86);
UPDATE manual_posts SET category='Khoa học & Khám phá', editorial_action='MOVE' WHERE id IN (68,69,71,92,93,94,95);
UPDATE manual_posts SET category='Quân sự & Công nghệ quốc phòng', editorial_action='MOVE' WHERE id=76;
UPDATE manual_posts SET category='Du lịch & Trải nghiệm', editorial_action='MOVE' WHERE id IN (100,101);
UPDATE manual_posts SET category='Thể thao', editorial_action='REWRITE' WHERE id IN (105,106,107,108,109);

-- Drafts retained for future rewrite/review.
UPDATE manual_posts SET category='Du lịch & Trải nghiệm', editorial_action='MOVE' WHERE id=19;
UPDATE manual_posts SET category='Học tập & Kỹ năng số', editorial_action='MOVE' WHERE id IN (20,30,33,46,47,48,50,53);
UPDATE manual_posts SET category='Khoa học & Khám phá', editorial_action='MOVE' WHERE id IN (21,38,39,40);
UPDATE manual_posts SET category='Công nghệ & AI', editorial_action='MOVE' WHERE id=24;
UPDATE manual_posts SET category='Quân sự & Công nghệ quốc phòng', editorial_action='MOVE' WHERE id=25;
UPDATE manual_posts SET category='Sức khỏe & Đời sống', editorial_action='MOVE', review_required=1 WHERE id IN (41,42,43,44,45,52,54);
UPDATE manual_posts SET category='Văn hóa & Sáng tạo', editorial_action='MOVE' WHERE id IN (56,57);

UPDATE manual_posts SET review_required=1
WHERE status='published' AND category IN ('Sức khỏe & Đời sống','Quân sự & Công nghệ quốc phòng');
UPDATE manual_posts SET review_required=1 WHERE id IN (15,77,80,81);
