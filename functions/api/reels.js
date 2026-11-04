import { json } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  const visible = await env.DB.prepare("SELECT value FROM settings WHERE key='facebook_feed_visible'").first();
  if (visible?.value !== "true") return json({ ok: true, enabled: false, items: [], hasMore: false });

  const url = new URL(request.url);
  const limit = Math.min(48, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "24", 10) || 24));
  const offset = Math.min(10000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  const rows = await env.DB.prepare(
    "SELECT id,facebook_id,item_type,caption,permalink,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,raw_json " +
    "FROM facebook_items WHERE status='published' AND item_type IN ('reel','video') " +
    "ORDER BY COALESCE(published_at,first_seen_at) DESC,id DESC LIMIT ? OFFSET ?"
  ).bind(limit + 1, offset).all();
  const results = rows.results || [];
  const selected = results.slice(0, limit);
  const items = selected.map(row => {
    let extra = {};
    try { extra = JSON.parse(row.raw_json || "{}") || {}; } catch {}
    const { raw_json, ...safe } = row;
    return {
      ...safe,
      viewLabel: extra.viewLabel || null,
      mediaWidth: Number(extra.mediaWidth) || null,
      mediaHeight: Number(extra.mediaHeight) || null,
      media: []
    };
  });
  return json({
    ok: true, enabled: true, items,
    hasMore: results.length > limit,
    nextOffset: offset + selected.length
  }, 200, { "cache-control": "public, max-age=60" });
}
