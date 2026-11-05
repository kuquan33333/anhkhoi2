import { json } from "../_utils.js";
import { CATEGORY_OPTIONS } from "../_editorial.js";

export async function onRequestGet({ env }) {
  const setting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='admin_manual_posts_visible'"
  ).first();
  if (setting?.value !== "true") {
    return json({ ok: true, categories: [], tags: [] });
  }

  const result = await env.DB.prepare(
    "SELECT category,tags_json FROM manual_posts WHERE status='published' " +
    "AND COALESCE(editorial_action,'KEEP') NOT IN ('ARCHIVE','REMOVE_DUPLICATE') ORDER BY published_at DESC"
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

  const alphabetic = (a, b) => a.name.localeCompare(b.name, "vi");
  const categoryRank = (a, b) => {
    const ai = CATEGORY_OPTIONS.indexOf(a.name);
    const bi = CATEGORY_OPTIONS.indexOf(b.name);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return alphabetic(a, b);
  };

  const categories = [...categoryCounts]
    .map(([name, count]) => ({ name, count }))
    .sort(categoryRank);
  const tags = [...tagCounts]
    .map(([name, count]) => ({ name, count }))
    .filter(item => item.count >= 2)
    .sort((a, b) => b.count - a.count || alphabetic(a, b))
    .slice(0, 15);

  return json({ ok: true, categories, tags }, 200, {
    "cache-control": "public, max-age=30"
  });
}
