
import { requireAdmin } from "../../../_auth.js";
import { json, readJson } from "../../../_utils.js";

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const fields = [];
  const values = [];
  if (["published","hidden","draft","shadow"].includes(body?.status)) {
    fields.push("status=?"); values.push(body.status);
  }
  if (typeof body?.caption === "string") {
    fields.push("caption=?"); values.push(body.caption.slice(0, 20000));
  }
  if (!fields.length) return json({ ok: false, error: "nothing_to_update" }, 400);
  values.push(params.id);
  await env.DB.prepare("UPDATE facebook_items SET " + fields.join(",") + ",last_seen_at=last_seen_at WHERE id=?").bind(...values).run();
  return json({ ok: true });
}
