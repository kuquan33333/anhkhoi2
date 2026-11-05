import { requireAdmin } from "../../../_auth.js";
import { json, readJson } from "../../../_utils.js";
import {
  editorialWarnings,
  normalizeCategory,
  normalizeMedia,
  normalizeSources,
  normalizeTags,
  pubDate,
  slugify,
} from "../../../_editorial.js";

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializePost(row) {
  const { tags_json, sources_json, media_json, ...safe } = row;
  const tags = parseArray(tags_json);
  const sources = normalizeSources(parseArray(sources_json));
  const media = normalizeMedia(parseArray(media_json));
  const warnings = editorialWarnings({
    title: row.title,
    excerpt: row.excerpt,
    body_markdown: row.body_markdown,
    category: row.category,
    tags,
    sources,
    media,
    cover_r2_key: row.cover_r2_key,
  });
  return { ...safe, tags, sources, media, warnings };
}

export async function onRequestGet({ request, env, params }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const row = await env.DB.prepare(
    "SELECT id,slug,title,title_en,excerpt,excerpt_en,body_markdown,body_markdown_en," +
    "language,category,tags_json,cover_r2_key,status,published_at,created_at,updated_at," +
    "sources_json,media_json,editorial_action,editorial_notes,review_required,archived_at " +
    "FROM manual_posts WHERE id=? LIMIT 1"
  ).bind(params.id).first();
  if (!row) return json({ ok:false, error:"not_found" }, 404);
  return json({ ok:true, post:serializePost(row) });
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

  const status = ["published","draft","archived"].includes(body?.status) ? body.status : current.status;
  const publishedAt = pubDate(
    body?.publishedAt,
    current.published_at || (status === "published" ? new Date().toISOString() : null),
  );
  const language = body?.language === "en" ? "en" : body?.language === "vi" ? "vi" : current.language;
  const oldTags = parseArray(current.tags_json);
  const oldSources = parseArray(current.sources_json);
  const oldMedia = parseArray(current.media_json);
  const tags = Array.isArray(body?.tags) ? normalizeTags(body.tags) : normalizeTags(oldTags);
  const sources = Array.isArray(body?.sources) ? normalizeSources(body.sources) : normalizeSources(oldSources);
  const media = Array.isArray(body?.media) ? normalizeMedia(body.media) : normalizeMedia(oldMedia);
  const category = body?.category === undefined ? current.category : normalizeCategory(body.category);
  const cover = typeof body?.coverR2Key !== "string" ? current.cover_r2_key :
    /^admin\/[A-Za-z0-9/_\-.]+$/.test(body.coverR2Key) ? body.coverR2Key : null;
  const candidate = {
    title,
    excerpt: String(body?.excerpt ?? current.excerpt ?? ""),
    bodyMarkdown: String(body?.bodyMarkdown ?? current.body_markdown ?? ""),
    category,
    tags,
    sources,
    media,
    coverR2Key: cover,
  };
  const warnings = editorialWarnings(candidate);
  if (status === "published" && warnings.length && body?.overrideWarnings !== true) {
    return json({ ok:false, error:"editorial_review_required", warnings, canOverride:true }, 409);
  }

  const editorialAction = ["KEEP","REWRITE","MOVE","ARCHIVE","REMOVE_DUPLICATE"].includes(body?.editorialAction)
    ? body.editorialAction : current.editorial_action || "KEEP";
  const reviewRequired = warnings.some(x => x.severity === "review" || x.severity === "error") ? 1 : 0;
  try {
    await env.DB.prepare(
      "UPDATE manual_posts SET slug=?,title=?,title_en=?,excerpt=?,excerpt_en=?,body_markdown=?,body_markdown_en=?," +
      "language=?,category=?,tags_json=?,cover_r2_key=?,status=?,published_at=?,sources_json=?,media_json=?," +
      "editorial_action=?,editorial_notes=?,review_required=?,archived_at=?,updated_at=datetime('now') WHERE id=?"
    ).bind(
      slug,
      title,
      String(body?.titleEn ?? current.title_en ?? "").slice(0, 300),
      String(body?.excerpt ?? current.excerpt ?? "").slice(0, 1000),
      String(body?.excerptEn ?? current.excerpt_en ?? "").slice(0, 1000),
      String(body?.bodyMarkdown ?? current.body_markdown ?? ""),
      String(body?.bodyMarkdownEn ?? current.body_markdown_en ?? ""),
      language,
      category,
      JSON.stringify(tags),
      cover,
      status,
      publishedAt,
      JSON.stringify(sources),
      JSON.stringify(media),
      editorialAction,
      String(body?.editorialNotes ?? current.editorial_notes ?? "").slice(0, 1200),
      reviewRequired,
      status === "archived" ? (current.archived_at || new Date().toISOString()) : null,
      params.id,
    ).run();
    return json({ ok:true, id:Number(params.id), slug, status, publishedAt, warnings });
  } catch (error) {
    return json({ ok:false, error:"update_failed", detail:String(error) }, 400);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const auth = await requireAdmin(request, env, { csrf:true });
  if (!auth.ok) return auth.response;
  const result = await env.DB.prepare(
    "UPDATE manual_posts SET status='archived',editorial_action=CASE WHEN editorial_action='REMOVE_DUPLICATE' " +
    "THEN editorial_action ELSE 'ARCHIVE' END,archived_at=COALESCE(archived_at,datetime('now')),updated_at=datetime('now') WHERE id=?"
  ).bind(params.id).run();
  if (!result.meta?.changes) return json({ ok:false,error:"not_found" },404);
  return json({ ok:true, archived:true });
}
