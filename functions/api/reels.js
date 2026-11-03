
import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const visibleRow = await env.DB.prepare("SELECT value FROM settings WHERE key='facebook_feed_visible'").first();
  if (visibleRow?.value !== "true") return json({ ok: true, enabled: false, items: [] });
  const rows = await env.DB.prepare(
    "SELECT id,item_type,caption,permalink,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status " +
    "FROM facebook_items WHERE status='published' AND item_type IN ('reel','video') " +
    "ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 100"
  ).all();
  return json({ ok: true, enabled: true, items: rows.results || [] }, 200, { "cache-control": "public, max-age=60" });
}
