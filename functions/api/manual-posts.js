
import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const visible = await env.DB.prepare("SELECT value FROM settings WHERE key='admin_manual_posts_visible'").first();
  if (visible?.value !== "true") return json({ ok: true, enabled: false, posts: [] });
  const rows = await env.DB.prepare(
    "SELECT slug,title,excerpt,body_markdown,language,category,tags_json,published_at " +
    "FROM manual_posts WHERE status='published' ORDER BY published_at DESC LIMIT 100"
  ).all();
  return json({ ok: true, enabled: true, posts: rows.results || [] }, 200, { "cache-control": "public, max-age=60" });
}
