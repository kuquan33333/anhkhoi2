
import { authenticate } from "../../_auth.js";
import { clearSessionCookie, json } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  const auth = await authenticate(request, env);
  if (auth) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(auth.session_id).run();
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}
