
import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare(
    "SELECT id,trigger_type,started_at,finished_at,status,discovered_count,inserted_count,updated_count,error_count,blocked_reason,notes " +
    "FROM sync_runs ORDER BY id DESC LIMIT 30"
  ).all();
  return json({ ok: true, runs: rows.results || [] });
}
