
import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  if (!env.FB_SYNC) return json({ ok: false, error: "sync_service_not_bound" }, 503);
  const response = await env.FB_SYNC.fetch("https://sync.internal/run", {
    method: "POST",
    headers: { "x-sync-trigger": "admin" },
  });
  const data = await response.json().catch(() => ({ ok: false, error: "bad_sync_response" }));
  return json(data, response.status);
}
