import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const setting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='admin_manual_posts_visible'"
  ).first();
  if (setting?.value !== "true") {
    return json({ ok: true, categories: [], tags: [] });
  }
  const result = await env.DB.prepare(
    "SELECT category,tags_json FROM manual_posts WHERE status='published' ORDER BY published_at DESC"
  ).all();
  const categoryCounts = new Map();
  const tagCounts = new Map();
  for (const post of result.results || []) {
    const category = String(post.category || "").trim();
    if (category) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    let tags = [];
    try { tags = JSON.parse(post.tags_json || "[]"); } catch {}
    for (const tag of new Set(Array.isArray(tags) ? tags : [])) {
      if (typeof tag !== "string" || !tag.trim()) continue;
      const name = tag.trim();
      tagCounts.set(name, (tagCounts.get(name) || 0) + 1);
    }
  }
  const CATEGORY_ORDER = [
      "Thời sự & Xã hội",
      "Thế giới",
      "Quân sự & Quốc phòng",
      "Pháp luật & An ninh",
      "Sức khỏe & Y tế",
      "Giáo dục",
      "Khoa học & Thiên văn",
      "Công nghệ & AI",
      "Kinh tế & Kinh doanh",
      "Đời sống & Tạp chí",
      "Văn hóa & Giải trí",
      "Thể thao"
  ];
  const alphabetic = (a, b) => a.name.localeCompare(b.name, "vi");
  const categoryRank = (a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.name);
    const bi = CATEGORY_ORDER.indexOf(b.name);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return alphabetic(a, b);
  };
  const popularity = (a, b) => b.count - a.count || alphabetic(a, b);
  const categories = [...categoryCounts]
    .map(([name, count]) => ({ name, count }))
    .sort(categoryRank);
  const tags = [...tagCounts]
    .map(([name, count]) => ({ name, count }))
    .filter(item => item.count >= 2)
    .sort(popularity)
    .slice(0, 10);

  return json({
    ok: true,
    categories,
    tags,
  }, 200, { "cache-control": "public, max-age=30" });
}
