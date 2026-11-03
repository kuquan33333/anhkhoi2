
import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const visible = await env.DB.prepare("SELECT value FROM settings WHERE key='admin_manual_posts_visible'").first();
  if (visible?.value !== "true") return json({ ok: true, enabled: false, posts: [] });
  const rows = await env.DB.prepare(
    "SELECT slug,title,excerpt,language,category,tags_json,cover_r2_key,published_at " +
    "FROM manual_posts WHERE status='published' ORDER BY published_at DESC LIMIT 100"
  ).all();
  const posts = (rows.results || []).map(row => {
    let tags = [];
    try { tags = JSON.parse(row.tags_json || "[]"); } catch {}
    const { tags_json, ...safe } = row;
    return { ...safe, tags };
  });
  return json({ ok: true, enabled: true, posts }, 200, { "cache-control": "public, max-age=60" });
}
