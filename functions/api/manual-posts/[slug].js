import { json } from "../../_utils.js";

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ env, params }) {
  const visible = await env.DB.prepare(
    "SELECT value FROM settings WHERE key='admin_manual_posts_visible'"
  ).first();
  if (visible?.value !== "true") return json({ ok: false, error: "disabled" }, 404);

  const slug = String(params.slug || "").trim();
  if (!slug || slug.length > 120) return json({ ok: false, error: "invalid_slug" }, 400);

  const post = await env.DB.prepare(
    "SELECT slug,title,title_en,excerpt,excerpt_en,body_markdown,body_markdown_en,language,category,tags_json," +
    "cover_r2_key,published_at,created_at,updated_at,sources_json,media_json,status,editorial_action " +
    "FROM manual_posts WHERE (slug=? OR legacy_slug=?) ORDER BY (slug=?) DESC LIMIT 1"
  ).bind(slug, slug, slug).first();
  if (!post) return json({ ok: false, error: "not_found" }, 404);

  if (post.status === "archived" || ["ARCHIVE", "REMOVE_DUPLICATE"].includes(post.editorial_action)) {
    return json({ ok: false, error: "archived", archived: true, redirect: "/archive/" }, 410, {
      "cache-control": "public, max-age=60"
    });
  }
  if (post.status !== "published") return json({ ok: false, error: "not_found" }, 404);

  const tags = parseArray(post.tags_json);
  const sources = parseArray(post.sources_json);
  const media = parseArray(post.media_json);
  const { tags_json, sources_json, media_json, status, editorial_action, ...safe } = post;
  const approxWords = Math.max(1, Math.round(String(post.body_markdown || "").length / 5.5));
  return json({
    ok: true,
    post: {
      ...safe,
      tags,
      sources,
      media,
      words: approxWords,
      minutes: Math.max(1, Math.ceil(approxWords / 220))
    }
  }, 200, { "cache-control": "public, max-age=30" });
}
