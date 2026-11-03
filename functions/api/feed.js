
import { json } from "../_utils.js";

async function setting(env, key, fallback) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return row?.value ?? fallback;
}

export async function onRequestGet({ env }) {
  const visible = (await setting(env, "facebook_feed_visible", "false")) === "true";
  if (!visible) return json({ ok: true, enabled: false, items: [] });
  const rows = await env.DB.prepare(
    "SELECT id,item_type,caption,permalink,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status " +
    "FROM facebook_items WHERE status='published' ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 50"
  ).all();
  return json({ ok: true, enabled: true, items: rows.results || [] }, 200, { "cache-control": "public, max-age=60" });
}
