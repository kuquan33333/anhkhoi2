import { createSession, ipKey, verifyPassword } from "../../_auth.js";
import { json, readJson, setSessionCookie } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  let stage = "start";
  try {
    stage = "read_request";
    const body = await readJson(request);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password) {
      return json({ ok: false, error: "missing_credentials" }, 400);
    }

    stage = "fingerprint";
    const key = await ipKey(request);

    stage = "lookup_user";
    const user = await env.DB.prepare(
      "SELECT id,username,password_hash,role,must_change_password FROM users WHERE username=? LIMIT 1"
    ).bind(username).first();

    stage = "verify_password";
    const valid = user ? await verifyPassword(password, user.password_hash) : false;

    // A correct password is always allowed through, even if stale failed-attempt
    // records exist. Rate limiting only applies to failed authentication.
    if (!valid) {
      stage = "rate_limit";
      const attempt = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE ip_key=? AND created_at>datetime('now','-15 minutes')"
      ).bind(key).first();
      if (Number(attempt?.count || 0) >= 5) {
        return json({ ok: false, error: "too_many_attempts", retryAfterSeconds: 900 }, 429);
      }

      stage = "record_failure";
      await env.DB.prepare(
        "INSERT INTO login_attempts(ip_key,username) VALUES(?,?)"
      ).bind(key, username).run();
      return json({ ok: false, error: "invalid_credentials" }, 401);
    }

    stage = "clear_failures";
    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE ip_key=? OR username=?"
    ).bind(key, username).run();

    stage = "create_session";
    const session = await createSession(env, user.id);

    stage = "response";
    return json(
      {
        ok: true,
        user: {
          username: user.username,
          mustChangePassword: !!user.must_change_password,
        },
        csrfToken: session.csrf,
      },
      200,
      { "set-cookie": setSessionCookie(session.token) },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        error: "login_server_error",
        stage,
        detail: String(error?.message || error).slice(0, 300),
      },
      500,
    );
  }
}
