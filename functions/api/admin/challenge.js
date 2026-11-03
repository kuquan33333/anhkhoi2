import { json } from "../../_utils.js";

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare(
    "SELECT password_hash FROM users WHERE role='admin' ORDER BY id LIMIT 1"
  ).first();
  const parts = String(row?.password_hash || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
    return json({ ok:false, error:"auth_config_invalid" },500);
  }
  return json({ ok:true, algorithm:"PBKDF2", hash:"SHA-256", iterations:Number(parts[1]), salt:parts[2] });
}
