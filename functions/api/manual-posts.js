import { json } from "../_utils.js";

function intParam(raw, fallback, max) {
  const n = Number.parseInt(raw || "", 10);
  return Number.isInteger(n) ? Math.max(0, Math.min(max, n)) : fallback;
}

export async function onRequestGet({ request, env }) {
  const visible = await env.DB.prepare("SELECT value FROM settings WHERE key='admin_manual_posts_visible'").first();
  if (visible?.value !== "true") {
    return json({ ok: true, enabled: false, posts: [], hasMore: false, nextOffset: 0, total: 0, pageCount: 0 });
  }
  const u = new URL(request.url);
  const limit = Math.max(1, intParam(u.searchParams.get("limit"), 8, 50));
  const offset = intParam(u.searchParams.get("offset"), 0, 10000);
  const category = (u.searchParams.get("category") || "").trim().slice(0, 80);
  const tag = (u.searchParams.get("tag") || "").trim().slice(0, 80);
  const search = (u.searchParams.get("search") || "").trim().slice(0, 100);
  const uncategorized = u.searchParams.get("uncategorized") === "true";

  const conditions = ["status='published'"];
  const params = [];
  if (category) {
    conditions.push("category = ? COLLATE NOCASE");
    params.push(category);
  }
  if (uncategorized) conditions.push("(category IS NULL OR trim(category) = '')");
  if (tag) {
    conditions.push("EXISTS (SELECT 1 FROM json_each(manual_posts.tags_json) WHERE value = ? COLLATE NOCASE)");
    params.push(tag);
  }
  if (search) {
    conditions.push("(title LIKE ? OR excerpt LIKE ? OR body_markdown LIKE ? OR title_en LIKE ? OR excerpt_en LIKE ?)");
    for (let i = 0; i < 5; i++) params.push("%" + search.replace(/[%_]/g, "") + "%");
  }
  const where = conditions.join(" AND ");
  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM manual_posts WHERE " + where
  ).bind(...params).first();
  const total = Math.max(0, Number(countRow?.total || 0));
  const pageCount = total ? Math.ceil(total / limit) : 0;
  const query = "SELECT id,slug,title,title_en,excerpt,excerpt_en,language,category,tags_json,cover_r2_key,published_at,updated_at," +
    "length(body_markdown) AS content_length FROM manual_posts WHERE " + where +
    " ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT ? OFFSET ?";
  const rows = await env.DB.prepare(query).bind(...params, limit + 1, offset).all();
  const results = rows.results || [];
  const selected = results.slice(0, limit).map(({ tags_json, content_length, ...rest }) => {
    let tags = [];
    try { tags = JSON.parse(tags_json || "[]"); } catch {}
    const approxWords = Math.max(1, Math.round(Number(content_length || 0) / 5.5));
    return {
      ...rest,
      tags,
      words: approxWords,
      minutes: Math.max(1, Math.ceil(approxWords / 220))
    };
  });
  return json({
    ok: true, enabled: true, posts: selected,
    hasMore: results.length > limit,
    nextOffset: offset + selected.length,
    total,
    pageCount
  }, 200, { "cache-control": "public, max-age=30" });
}