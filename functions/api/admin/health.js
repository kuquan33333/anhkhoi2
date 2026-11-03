
import { json } from "../../_utils.js";

export async function onRequestGet({ env }) {
  const checks = { db: false, pbkdf2: false, sessionSchema: false };
  const errors = {};

  try {
    const row = await env.DB.prepare("SELECT 1 AS ok").first();
    checks.db = Number(row?.ok) === 1;
  } catch (error) {
    errors.db = String(error);
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("diagnostic"),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array([1,2,3,4,5,6,7,8]), iterations: 1000 },
      key,
      256,
    );
    checks.pbkdf2 = bits.byteLength === 32;
  } catch (error) {
    errors.pbkdf2 = String(error);
  }

  try {
    const info = await env.DB.prepare("PRAGMA table_info(sessions)").all();
    const names = new Set((info.results || []).map(row => row.name));
    checks.sessionSchema = ["id","user_id","token_hash","csrf_token_hash","expires_at"].every(name => names.has(name));
  } catch (error) {
    errors.sessionSchema = String(error);
  }

  return json({ ok: Object.values(checks).every(Boolean), checks, errors });
}
