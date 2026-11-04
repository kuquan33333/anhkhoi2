import { createSession, ipKey } from "../../_auth.js";
import { base64UrlToBytes, bytesToBase64Url, json, readJson, safeEqual, setSessionCookie } from "../../_utils.js";

async function expectedProof(passwordHash, challengeId, nonce) {
  const parts = String(passwordHash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return "";
  const keyBytes = base64UrlToBytes(parts[3]);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name:"HMAC", hash:"SHA-256" },
    false,
    ["sign"]
  );
  const message = new TextEncoder().encode(challengeId + "." + nonce);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function onRequestPost({ request, env }) {
  let stage = "start";
  try {
    const body = await readJson(request);
    const username = String(body?.username || "").trim();
    const challengeId = String(body?.challengeId || "").trim();
    const proof = String(body?.proof || "").trim();
    if (!username || !challengeId || !proof) {
      return json({ ok:false, error:"missing_credentials" },400);
    }

    stage = "lookup";
    const user = await env.DB.prepare(
      "SELECT id,username,password_hash,role,must_change_password FROM users WHERE username=? LIMIT 1"
    ).bind(username).first();

    const challenge = await env.DB.prepare(
      "SELECT id,nonce,expires_at FROM admin_login_challenges WHERE id=? AND expires_at>datetime('now') LIMIT 1"
    ).bind(challengeId).first();

    // Consume the challenge regardless of success so a proof cannot be replayed.
    await env.DB.prepare("DELETE FROM admin_login_challenges WHERE id=?").bind(challengeId).run();

    stage = "verify";
    const expected = user && challenge
      ? await expectedProof(user.password_hash, challengeId, challenge.nonce)
      : "";
    const valid = !!user && !!challenge && !!expected && safeEqual(proof, expected);

    const key = await ipKey(request);
    if (!valid) {
      const attempt = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE ip_key=? AND created_at>datetime('now','-15 minutes')"
      ).bind(key).first();
      if (Number(attempt?.count || 0) >= 5) {
        return json({ok:false,error:"too_many_attempts",retryAfterSeconds:900},429);
      }
      await env.DB.prepare(
        "INSERT INTO login_attempts(ip_key,username) VALUES(?,?)"
      ).bind(key,username).run();
      return json({ok:false,error:"invalid_credentials"},401);
    }

    stage = "clear_failures";
    await env.DB.prepare(
      "DELETE FROM login_attempts WHERE ip_key=? OR username=?"
    ).bind(key,username).run();

    stage = "session";
    const session = await createSession(env, user.id);
    return json(
      {ok:true,user:{username:user.username,mustChangePassword:!!user.must_change_password},csrfToken:session.csrf},
      200,
      {"set-cookie":setSessionCookie(session.token)}
    );
  } catch (error) {
    return json({
      ok:false,
      error:"login_server_error",
      stage,
      detail:String(error?.message || error).slice(0,300)
    },500);
  }
}
