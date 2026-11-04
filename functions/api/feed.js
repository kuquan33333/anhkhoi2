import { json } from "../_utils.js";

function pagination(request, defaultLimit) {
  const url = new URL(request.url);
  const limit = Math.min(48, Math.max(1, Number.parseInt(url.searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit));
  const offset = Math.min(10000, Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0));
  return { limit, offset };
}

async function listItems(env, where, limit, offset) {
  const query = "SELECT id,facebook_id,item_type,caption,permalink,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,raw_json " +
    "FROM facebook_items WHERE status='published' " + where +
    " ORDER BY COALESCE(published_at,first_seen_at) DESC,id DESC LIMIT ? OFFSET ?";
  const rows = await env.DB.prepare(query).bind(limit + 1, offset).all();
  const results = rows.results || [];
  const hasMore = results.length > limit;
  const selected = results.slice(0, limit);
  const ids = selected.map(row => row.id);
  const byId = new Map();
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(",");
    const mediaRows = await env.DB.prepare(
      "SELECT item_id,media_type,source_url,r2_key,width,height,ordinal FROM facebook_media WHERE item_id IN (" +
      placeholders + ") ORDER BY item_id,ordinal,id"
    ).bind(...ids).all();
    for (const media of mediaRows.results || []) {
      if (!byId.has(media.item_id)) byId.set(media.item_id, []);
      byId.get(media.item_id).push({
        type: media.media_type,
        source_url: media.source_url,
        r2_key: media.r2_key,
        width: media.width,
        height: media.height
      });
    }
  }
  const items = selected.map(row => {
    let extra = {};
    try { extra = JSON.parse(row.raw_json || "{}") || {}; } catch {}
    const { raw_json, ...safe } = row;
    return {
      ...safe,
      viewLabel: extra.viewLabel || null,
      mediaWidth: Number(extra.mediaWidth) || null,
      mediaHeight: Number(extra.mediaHeight) || null,
      media: byId.get(row.id) || []
    };
  });
  return { items, hasMore, nextOffset: offset + selected.length };
}

export async function onRequestGet({ request, env }) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='facebook_feed_visible'").first();
  if (row?.value !== "true") return json({ ok: true, enabled: false, items: [], hasMore: false });
  const { limit, offset } = pagination(request, 24);
  const page = await listItems(env, "", limit, offset);
  return json({ ok: true, enabled: true, ...page }, 200, { "cache-control": "public, max-age=60" });
}
