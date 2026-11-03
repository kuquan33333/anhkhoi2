
import { requireAdmin } from "../../_auth.js";
import { json } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  const result = await requireAdmin(request, env, { rotateCsrf: true });
  if (!result.ok) return result.response;
  return json({
    ok: true,
    user: {
      username: result.auth.username,
      mustChangePassword: !!result.auth.must_change_password,
    },
    csrfToken: result.auth.csrf,
  });
}
