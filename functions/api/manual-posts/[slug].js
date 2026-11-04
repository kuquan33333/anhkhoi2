import { json } from "../../_utils.js";

export async function onRequestGet({ env, params }) {
  const visible = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='admin_manual_posts_visible'"
  ).first();
  if (visible?.value !== "true") return json({ ok: false, error: "disabled" }, 404);

  const slug = String(params.slug || "").trim();
  if (!slug || slug.length > 120) return json({ ok: false, error: "invalid_slug" }, 400);
  const post = await env.DB.prepare(
    "SELECT slug,title,title_en,excerpt,excerpt_en,body_markdown,body_markdown_en,language,category,tags_json," +
    "cover_r2_key,published_at,created_at,updated_at FROM manual_posts " +
    "WHERE (slug=? OR legacy_slug=?) AND status='published' ORDER BY (slug=?) DESC LIMIT 1"
  ).bind(slug, slug, slug).first();
  if (!post) return json({ ok: false, error: "not_found" }, 404);
  let tags = [];
  try { tags = JSON.parse(post.tags_json || "[]"); } catch {}
  const { tags_json, ...safe } = post;
  return json({ ok: true, post: { ...safe, tags } }, 200, {
    "cache-control": "public, max-age=30"
  });
}