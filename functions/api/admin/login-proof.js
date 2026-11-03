import { createSession, ipKey } from "../../_auth.js";
import { json, readJson, safeEqual, setSessionCookie } from "../../_utils.js";

export async function onRequestPost({ request, env }) {
  let stage = "start";
  try {
    const body = await readJson(request);
    const username = String(body?.username || "").trim();
    const proof = String(body?.proof || "").trim();
    if (!username || !proof) return json({ ok:false, error:"missing_credentials" },400);

    stage = "lookup";
    const user = await env.DB.prepare(
      "SELECT id,username,password_hash,role,must_change_password FROM users WHERE username=? LIMIT 1"
    ).bind(username).first();

    stage = "verify";
    const parts = String(user?.password_hash || "").split("$");
    const expected = parts.length === 4 ? parts[3] : "";
    if (!user || !expected || !safeEqual(proof, expected)) {
      const key = await ipKey(request);
      const attempt = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE ip_key=? AND created_at>datetime('now','-15 minutes')"
      ).bind(key).first();
      if (Number(attempt?.count || 0) >= 5) return json({ok:false,error:"too_many_attempts"},429);
      await env.DB.prepare("INSERT INTO login_attempts(ip_key,username) VALUES(?,?)").bind(key,username).run();
      return json({ok:false,error:"invalid_credentials"},401);
    }

    stage = "session";
    const session = await createSession(env, user.id);
    return json(
      {ok:true,user:{username:user.username,mustChangePassword:!!user.must_change_password},csrfToken:session.csrf},
      200,
      {"set-cookie":setSessionCookie(session.token)}
    );
  } catch (error) {
    return json({ok:false,error:"login_server_error",stage,detail:String(error?.message||error).slice(0,300)},500);
  }
}
