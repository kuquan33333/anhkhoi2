
import { json } from "../_utils.js";

export async function onRequestGet({ env }) {
  const visibleRow = await env.DB.prepare("SELECT value FROM settings WHERE key='facebook_feed_visible'").first();
  if (visibleRow?.value !== "true") return json({ ok: true, enabled: false, items: [] });
  const rows = await env.DB.prepare(
    "SELECT id,facebook_id,item_type,caption,permalink,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,raw_json " +
    "FROM facebook_items WHERE status='published' AND item_type IN ('reel','video') " +
    "ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT 100"
  ).all();
  const items = (rows.results || []).map(row => {
    let viewLabel = null;
    try { viewLabel = JSON.parse(row.raw_json || "{}").viewLabel || null; } catch {}
    const { raw_json, ...safe } = row;
    return { ...safe, viewLabel };
  });
  return json({ ok: true, enabled: true, items }, 200, { "cache-control": "public, max-age=60" });
}
