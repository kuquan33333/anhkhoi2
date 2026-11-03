
import { hashPassword, requireAdmin, verifyPassword } from "../../_auth.js";
import { json, readJson } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (newPassword.length < 10) return json({ ok: false, error: "password_too_short" }, 400);
  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id=?").bind(auth.auth.user_id).first();
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    return json({ ok: false, error: "current_password_invalid" }, 400);
  }
  const encoded = await hashPassword(newPassword);
  await env.DB.prepare("UPDATE users SET password_hash=?,must_change_password=0,updated_at=datetime('now') WHERE id=?")
    .bind(encoded, auth.auth.user_id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND id<>?").bind(auth.auth.user_id, auth.auth.session_id).run();
  return json({ ok: true });
}
