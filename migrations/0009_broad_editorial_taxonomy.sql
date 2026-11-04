-- Broaden editorial taxonomy while keeping a small number of top-level sections.
UPDATE manual_posts SET category='Công nghệ & AI'
WHERE slug IN (
  'gpt-6-1-terra-ai-thao-tac-may-tinh',
  'gemini-4-carbon-ai-an-ninh-mang',
  'siri-ai-mo-cua-cho-ung-dung-ben-thu-ba',
  'opera-webai-ai-chay-trong-trinh-duyet',
  'apple-chua-the-xac-inh-khi-nao-iphone-duo-het-khan-hang',
  'tin-cong-nghe-va-kiem-chung'
);

UPDATE manual_posts SET category='Kinh tế & Kinh doanh'
WHERE slug IN (
  'amd-openai-meta-cuoc-dua-chip-ai',
  'data-center-ai-linh-hoat-luoi-dien',
  'drax-data-center-ai-1gw-anh'
);

UPDATE manual_posts SET category='Khoa học & Thiên văn'
WHERE slug='optimus-san-xuat-robot-hinh-nguoi';

UPDATE manual_posts SET category='Văn hóa & Giải trí'
WHERE slug IN ('video-ai-2026-tu-tao-clip-den-hau-ky','video-ai-ke-chuyen');

UPDATE manual_posts SET category='Thế giới'
WHERE slug='eu-ai-act-gan-nhan-noi-dung-ai';

UPDATE manual_posts SET category='Đời sống & Tạp chí'
WHERE slug='chao-mung-anh-khoi-ai-media';
