import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const fb = await env.DB.prepare(
    "SELECT COUNT(*) AS total," +
    "SUM(CASE WHEN status=\'published\' THEN 1 ELSE 0 END) AS published," +
    "SUM(CASE WHEN caption<>\'\' THEN 1 ELSE 0 END) AS captions," +
    "SUM(CASE WHEN thumbnail_url IS NOT NULL THEN 1 ELSE 0 END) AS thumbnails," +
    "SUM(CASE WHEN r2_thumbnail_key IS NOT NULL THEN 1 ELSE 0 END) AS cached FROM facebook_items"
  ).first();
  const posts = await env.DB.prepare(
    "SELECT COUNT(*) AS total,SUM(CASE WHEN status=\'published\' THEN 1 ELSE 0 END) AS published FROM manual_posts"
  ).first();
  const last = await env.DB.prepare(
    "SELECT id,status,trigger_type,started_at,finished_at,discovered_count,inserted_count,updated_count,error_count,blocked_reason FROM sync_runs ORDER BY id DESC LIMIT 1"
  ).first();
  const media = await env.MEDIA.list({ prefix:"admin/", limit:100 });
  return json({ ok:true, facebook:fb || {}, posts:posts || {}, lastSync:last || null, media:{count:(media.objects||[]).length,truncated:!!media.truncated} });
}
