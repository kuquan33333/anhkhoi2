import { requireAdmin } from "../../../_auth.js";
import { json, readJson } from "../../../_utils.js";

const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

export async function onRequestGet({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const row = await env.DB.prepare(
    "SELECT id,slug,title,excerpt,body_markdown,language,category,tags_json,cover_r2_key,status,published_at,created_at,updated_at FROM manual_posts WHERE id=? LIMIT 1"
  ).bind(params.id).first();
  if (!row) return json({ ok:false, error:"not_found" }, 404);
  let tags = [];
  try { tags = JSON.parse(row.tags_json || "[]"); } catch {}
  const { tags_json, ...safe } = row;
  return json({ ok:true, post:{ ...safe, tags } });
}

export async function onRequestPatch({ request, env, params }) {
  const auth = await requireAdmin(request, env, { csrf:true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const current = await env.DB.prepare("SELECT * FROM manual_posts WHERE id=? LIMIT 1").bind(params.id).first();
  if (!current) return json({ ok:false, error:"not_found" }, 404);
  const title = String(body?.title ?? current.title).trim();
  const slug = slugify(body?.slug ?? current.slug ?? title);
  if (!title || !slug) return json({ ok:false, error:"title_required" }, 400);
  const status = body?.status === "published" ? "published" : "draft";
  const publishedAt = status === "published" ? (current.published_at || new Date().toISOString()) : null;
  const language = body?.language === "en" ? "en" : "vi";
  let oldTags = []; try { oldTags = JSON.parse(current.tags_json || "[]"); } catch {}
  const tags = Array.isArray(body?.tags) ? body.tags.map(x=>String(x).trim()).filter(Boolean).slice(0,20) : oldTags;
  const cover = typeof body?.coverR2Key === "string" && /^admin\/[A-Za-z0-9/_\-.]+$/.test(body.coverR2Key)
    ? body.coverR2Key
    : null;
  try {
    await env.DB.prepare(
      "UPDATE manual_posts SET slug=?,title=?,excerpt=?,body_markdown=?,language=?,category=?,tags_json=?,cover_r2_key=?,status=?,published_at=?,updated_at=datetime('now') WHERE id=?"
    ).bind(
      slug,title,String(body?.excerpt ?? current.excerpt ?? ""),String(body?.bodyMarkdown ?? current.body_markdown ?? ""),
      language,body?.category ? String(body.category).slice(0,80) : null,JSON.stringify(tags),
      cover,status,publishedAt,params.id
    ).run();
    return json({ ok:true,id:Number(params.id),slug,status,publishedAt });
  } catch (error) {
    return json({ ok:false,error:"update_failed",detail:String(error) }, 400);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env, { csrf:true });
  if (!auth.ok) return auth.response;
  const result = await env.DB.prepare("DELETE FROM manual_posts WHERE id=?").bind(params.id).run();
  if (!result.meta?.changes) return json({ ok:false,error:"not_found" },404);
  return json({ ok:true });
}
