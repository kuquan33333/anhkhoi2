
import { createSession, ipKey, verifyPassword } from "../../_auth.js";
import { json, readJson, setSessionCookie } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  if (!username || !password) return json({ ok: false, error: "missing_credentials" }, 400);

  const key = await ipKey(request);
  const attempt = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM login_attempts WHERE ip_key=? AND created_at>datetime('now','-15 minutes')"
  ).bind(key).first();
  if (Number(attempt?.count || 0) >= 5) return json({ ok: false, error: "too_many_attempts" }, 429);

  const user = await env.DB.prepare(
    "SELECT id,username,password_hash,role,must_change_password FROM users WHERE username=? LIMIT 1"
  ).bind(username).first();
  const valid = user ? await verifyPassword(password, user.password_hash) : false;
  if (!valid) {
    await env.DB.prepare("INSERT INTO login_attempts(ip_key,username) VALUES(?,?)").bind(key, username).run();
    return json({ ok: false, error: "invalid_credentials" }, 401);
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE ip_key=?").bind(key).run();
  const session = await createSession(env, user.id);
  return json(
    { ok: true, user: { username: user.username, mustChangePassword: !!user.must_change_password }, csrfToken: session.csrf },
    200,
    { "set-cookie": setSessionCookie(session.token) },
  );
}
