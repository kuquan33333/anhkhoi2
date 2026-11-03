
import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  const rows = await env.DB.prepare(
    "SELECT id,facebook_id,item_type,caption,permalink,published_at,first_seen_at,last_seen_at,thumbnail_url,r2_thumbnail_key,embed_status,status,raw_json " +
    "FROM facebook_items ORDER BY COALESCE(published_at,first_seen_at) DESC LIMIT ?"
  ).bind(limit).all();
  const items = (rows.results || []).map(row => {
    let viewLabel = null;
    try { viewLabel = JSON.parse(row.raw_json || "{}").viewLabel || null; } catch {}
    const { raw_json, ...safe } = row;
    return { ...safe, viewLabel };
  });
  return json({ ok: true, items });
}
