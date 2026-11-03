
import { requireAdmin } from "../../_auth.js";
import { json, readJson } from "../../_utils.js";

const slugify = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare(
    "SELECT id,slug,title,excerpt,language,category,tags_json,cover_r2_key,status,published_at,created_at,updated_at FROM manual_posts ORDER BY id DESC LIMIT 100"
  ).all();
  return json({ ok: true, posts: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const slug = slugify(body?.slug || title);
  if (!title || !slug) return json({ ok: false, error: "title_required" }, 400);
  const status = body?.status === "published" ? "published" : "draft";
  const publishedAt = status === "published" ? new Date().toISOString() : null;
  const language = body?.language === "en" ? "en" : "vi";
  const tags = Array.isArray(body?.tags)
    ? body.tags.map(x => String(x).trim()).filter(Boolean).slice(0, 20)
    : [];
  const cover = typeof body?.coverR2Key === "string" && /^admin\/[A-Za-z0-9/_\-.]+$/.test(body.coverR2Key)
    ? body.coverR2Key
    : null;
  try {
    const r = await env.DB.prepare(
      "INSERT INTO manual_posts(slug,title,excerpt,body_markdown,language,category,tags_json,cover_r2_key,status,published_at) VALUES(?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      slug, title, String(body?.excerpt || "").slice(0, 1000), String(body?.bodyMarkdown || ""), language,
      body?.category ? String(body.category).slice(0, 80) : null, JSON.stringify(tags),
      cover, status, publishedAt
    ).run();
    return json({ ok: true, id: r.meta?.last_row_id, slug });
  } catch (error) {
    return json({ ok: false, error: "save_failed", detail: String(error) }, 400);
  }
}
