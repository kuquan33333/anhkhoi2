import { json, randomToken } from "../../_utils.js";

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare(
      "SELECT password_hash FROM users WHERE role='admin' ORDER BY id LIMIT 1"
    ).first();
    const parts = String(row?.password_hash || "").split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
      return json({ ok:false, error:"auth_config_invalid" },500);
    }

    await env.DB.prepare(
      "DELETE FROM admin_login_challenges WHERE expires_at<=datetime('now')"
    ).run();

    const challengeId = randomToken(18);
    const nonce = randomToken(24);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    await env.DB.prepare(
      "INSERT INTO admin_login_challenges(id,nonce,expires_at) VALUES(?,?,?)"
    ).bind(challengeId, nonce, expiresAt).run();

    return json({
      ok:true,
      algorithm:"PBKDF2",
      hash:"SHA-256",
      iterations:Number(parts[1]),
      salt:parts[2],
      challengeId,
      nonce,
      expiresAt
    });
  } catch (error) {
    return json({ ok:false, error:"challenge_server_error", detail:String(error?.message || error).slice(0,200) },500);
  }
}
