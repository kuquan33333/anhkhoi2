export const CATEGORY_OPTIONS = [
  "Công nghệ & AI",
  "Khoa học & Khám phá",
  "Quân sự & Công nghệ quốc phòng",
  "Du lịch & Trải nghiệm",
  "Văn hóa & Sáng tạo",
  "Học tập & Kỹ năng số",
  "Sức khỏe & Đời sống",
  "Thể thao",
  "Góc nhìn & Phân tích",
];

export const CATEGORY_SET = new Set(CATEGORY_OPTIONS);

export function normalizeCategory(value) {
  const name = String(value || "").trim();
  return CATEGORY_SET.has(name) ? name : null;
}

export function normalizeTags(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map(x => String(x).trim())
      .filter(Boolean)
  )].slice(0, 5);
}

function safeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const name = String(raw.name || "").trim().slice(0, 180);
    const title = String(raw.title || "").trim().slice(0, 300);
    const url = safeUrl(raw.url);
    const type = ["official", "research", "press", "industry", "reference"].includes(raw.type)
      ? raw.type : "reference";
    if (!name) continue;
    const key = (name + "|" + title + "|" + url).toLocaleLowerCase("vi");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, title, url, type });
    if (out.length >= 12) break;
  }
  return out;
}

export function normalizeMedia(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const key = String(raw.key || "").trim();
    if (!/^admin\/[A-Za-z0-9/_\-.]+$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      alt: String(raw.alt || "").trim().slice(0, 220),
      caption: String(raw.caption || "").trim().slice(0, 350),
      credit: String(raw.credit || "").trim().slice(0, 220),
    });
    if (out.length >= 6) break;
  }
  return out;
}

export const slugify = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100);

export function pubDate(input, fallback) {
  const text = String(input || "").trim();
  if (!text) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.test(text)) return fallback;
  const d = new Date(text);
  return Number.isFinite(d.valueOf()) ? d.toISOString() : fallback;
}

function normalizedBlock(value) {
  return String(value || "").toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function duplicateBlocks(body) {
  const paragraphs = String(body || "").split(/\n\s*\n/)
    .map(x => x.trim())
    .filter(x => x.length >= 100 && !x.startsWith("#"));
  const headings = String(body || "").split("\n")
    .map(x => x.trim())
    .filter(x => /^#{2,4}\s+/.test(x));
  const repeated = [];
  for (const [kind, items] of [["paragraph", paragraphs], ["heading", headings]]) {
    const seen = new Set();
    for (const item of items) {
      const key = normalizedBlock(item);
      if (!key) continue;
      if (seen.has(key)) repeated.push({ kind, sample: item.slice(0, 120) });
      seen.add(key);
    }
  }
  return repeated;
}

export function editorialWarnings(post) {
  const warnings = [];
  const body = String(post.bodyMarkdown || post.body_markdown || "");
  const title = String(post.title || "").trim();
  const excerpt = String(post.excerpt || "").trim();
  const category = normalizeCategory(post.category);
  const tags = normalizeTags(post.tags);
  const sources = normalizeSources(post.sources);
  const media = normalizeMedia(post.media);
  const cover = String(post.coverR2Key ?? post.cover_r2_key ?? "").trim();

  if (!title) warnings.push({ code:"title_missing", severity:"error", message:"Chưa có tiêu đề." });
  if (!category) warnings.push({ code:"category_missing", severity:"error", message:"Chưa chọn chuyên mục hợp lệ." });
  if (!tags.length) warnings.push({ code:"tags_missing", severity:"warning", message:"Chưa có chủ đề/tag hỗ trợ khám phá nội dung." });
  if (!excerpt || excerpt.length < 70) warnings.push({ code:"excerpt_short", severity:"warning", message:"Excerpt quá ngắn hoặc chưa có." });
  if (excerpt.length > 280) warnings.push({ code:"excerpt_long", severity:"warning", message:"Excerpt dài hơn 280 ký tự." });
  if (body.trim().length < 3500) warnings.push({ code:"body_short", severity:"error", message:"Nội dung còn ngắn; cần bổ sung giá trị trước khi xuất bản." });
  if (!cover || !/^admin\/[A-Za-z0-9/_\-.]+$/.test(cover)) warnings.push({ code:"cover_missing", severity:"error", message:"Chưa có ảnh cover hợp lệ trên R2." });
  if (!sources.length) warnings.push({ code:"sources_missing", severity:"error", message:"Chưa có nguồn tham khảo có cấu trúc." });
  else if (sources.length === 1) warnings.push({ code:"sources_single", severity:"warning", message:"Bài chỉ có 1 nguồn; nên kiểm chứng thêm nguồn độc lập khi có claim quan trọng." });
  if (sources.some(x => !x.url)) warnings.push({ code:"source_url_missing", severity:"warning", message:"Có nguồn chưa lưu URL nội bộ để biên tập viên kiểm chứng lại." });
  if (media.some(x => !x.alt)) warnings.push({ code:"media_alt_missing", severity:"warning", message:"Có ảnh minh họa chưa có alt text." });
  if (/\\n\\n/.test(body)) warnings.push({ code:"markdown_literal_newline", severity:"error", message:"Phát hiện chuỗi \\n\\n hiển thị bất thường trong Markdown." });
  const duplicates = duplicateBlocks(body);
  if (duplicates.some(x => x.kind === "paragraph")) warnings.push({ code:"duplicate_paragraph", severity:"error", message:"Phát hiện paragraph lặp trong bài." });
  if (duplicates.some(x => x.kind === "heading")) warnings.push({ code:"duplicate_heading", severity:"warning", message:"Phát hiện heading lặp trong bài." });
  if (/\b(sốc|chấn động|không thể tin|kinh hoàng|gây sốc)\b/iu.test(title)) warnings.push({ code:"clickbait_title", severity:"warning", message:"Tiêu đề có dấu hiệu giật tít; nên biên tập lại." });

  if (category === "Sức khỏe & Đời sống") {
    warnings.push({ code:"health_review", severity:"review", message:"Nội dung sức khỏe: kiểm tra nguồn chính thống và tránh chẩn đoán/kê đơn cá nhân." });
  }
  if (category === "Quân sự & Công nghệ quốc phòng") {
    warnings.push({ code:"military_review", severity:"review", message:"Nội dung quân sự: chỉ dùng thông tin công khai, không hướng dẫn chế tạo/tấn công hoặc nêu điểm yếu nhạy cảm." });
  }
  return warnings;
}
