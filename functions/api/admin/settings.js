
import { requireAdmin } from "../../_auth.js";
import { json, readJson } from "../../_utils.js";

const allowed = new Set([
  "facebook_sync_enabled","facebook_auto_publish","facebook_feed_visible","facebook_shadow_mode",
  "crawler_interval_minutes","crawler_max_scrolls","crawler_max_items_per_run",
  "admin_manual_posts_visible","sync_failure_backoff_minutes"
]);

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare("SELECT key,value,updated_at FROM settings ORDER BY key").all();
  return json({ ok: true, settings: Object.fromEntries((rows.results || []).map(r => [r.key, r.value])) });
}

export async function onRequestPatch({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const entries = Object.entries(body?.settings || {}).filter(([key]) => allowed.has(key));
  if (!entries.length) return json({ ok: false, error: "no_valid_settings" }, 400);
  for (const [key, value] of entries) {
    await env.DB.prepare(
      "INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')"
    ).bind(key, String(value)).run();
  }
  return json({ ok: true });
}
