
import { base64UrlToBytes, bytesToBase64Url, getCookie, json, randomToken, safeEqual, sha256 } from "./_utils.js";

const PBKDF2_ITERATIONS = 180000;

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function verifyPassword(password, encoded) {
  const [kind, iter, salt64, expected] = String(encoded || "").split("$");
  if (kind !== "pbkdf2_sha256" || !iter || !salt64 || !expected) return false;
  const actual = await derivePassword(password, base64UrlToBytes(salt64), Number(iter));
  return safeEqual(actual, expected);
}

export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const digest = await derivePassword(password, salt, PBKDF2_ITERATIONS);
  return \`pbkdf2_sha256$\${PBKDF2_ITERATIONS}$\${bytesToBase64Url(salt)}$\${digest}\`;
}

export async function ipKey(request) {
  return sha256((request.headers.get("cf-connecting-ip") || "unknown") + "|" + (request.headers.get("user-agent") || ""));
}

export async function createSession(env, userId) {
  const id = randomToken(18);
  const token = randomToken(32);
  const csrf = randomToken(24);
  const tokenHash = await sha256(token);
  const csrfHash = await sha256(csrf);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions(id,user_id,token_hash,csrf_token_hash,expires_at) VALUES(?,?,?,?,?)"
  ).bind(id, userId, tokenHash, csrfHash, expiresAt).run();
  return { token, csrf, expiresAt };
}

export async function authenticate(request, env, rotateCsrf = false) {
  const token = getCookie(request, "ak_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT s.id AS session_id,s.csrf_token_hash,s.expires_at,u.id AS user_id,u.username,u.role,u.must_change_password " +
    "FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') LIMIT 1"
  ).bind(tokenHash).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE sessions SET last_seen_at=datetime('now') WHERE id=?").bind(row.session_id).run();
  if (!rotateCsrf) return row;
  const csrf = randomToken(24);
  const csrfHash = await sha256(csrf);
  await env.DB.prepare("UPDATE sessions SET csrf_token_hash=? WHERE id=?").bind(csrfHash, row.session_id).run();
  return { ...row, csrf_token_hash: csrfHash, csrf };
}

export async function requireAdmin(request, env, { csrf = false, rotateCsrf = false } = {}) {
  const auth = await authenticate(request, env, rotateCsrf);
  if (!auth || auth.role !== "admin") return { ok: false, response: json({ ok: false, error: "unauthorized" }, 401) };
  if (csrf) {
    const token = request.headers.get("x-admin-csrf") || "";
    const hash = token ? await sha256(token) : "";
    if (!safeEqual(hash, auth.csrf_token_hash)) {
      return { ok: false, response: json({ ok: false, error: "csrf_failed" }, 403) };
    }
  }
  return { ok: true, auth };
}
