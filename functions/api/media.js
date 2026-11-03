
import { json } from "../_utils.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  if (!/^facebook\/[A-Za-z0-9/_\-.]+$/.test(key)) return json({ ok: false, error: "invalid_key" }, 400);
  const object = await env.MEDIA.get(key);
  if (!object) return json({ ok: false, error: "not_found" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
