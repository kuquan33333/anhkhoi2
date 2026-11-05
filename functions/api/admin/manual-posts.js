import { requireAdmin } from "../../_auth.js";
import { json, readJson } from "../../_utils.js";
import {
  editorialWarnings,
  normalizeCategory,
  normalizeMedia,
  normalizeSources,
  normalizeTags,
  pubDate,
  slugify,
} from "../../_editorial.js";

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function onRequestGet({ request, env }) {
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return auth.response;
  const rows = await env.DB.prepare(
    "SELECT id,slug,title,title_en,excerpt,language,category,tags_json,cover_r2_key,status,published_at,created_at,updated_at," +
    "editorial_action,editorial_notes,review_required,archived_at,sources_json,media_json " +
    "FROM manual_posts ORDER BY COALESCE(published_at,created_at) DESC,id DESC LIMIT 500"
  ).all();
  const posts = (rows.results || []).map(({ tags_json, sources_json, media_json, ...rest }) => ({
    ...rest,
    tags: parseArray(tags_json),
    sourceCount: parseArray(sources_json).length,
    mediaCount: parseArray(media_json).length,
  }));
  return json({ ok: true, posts });
}

export async function onRequestPost({ request, env }) {
  const auth = await requireAdmin(request, env, { csrf: true });
  if (!auth.ok) return auth.response;
  const body = await readJson(request);
  const title = String(body?.title || "").trim();
  const slug = slugify(body?.slug || title);
  if (!title || !slug) return json({ ok: false, error: "title_required" }, 400);

  const requestedStatus = ["published", "draft", "archived"].includes(body?.status) ? body.status : "draft";
  const publishedAt = pubDate(body?.publishedAt, requestedStatus === "published" ? new Date().toISOString() : null);
  const language = body?.language === "en" ? "en" : "vi";
  const tags = normalizeTags(body?.tags);
  const sources = normalizeSources(body?.sources);
  const media = normalizeMedia(body?.media);
  const category = normalizeCategory(body?.category);
  const cover = typeof body?.coverR2Key === "string" && /^admin\/[A-Za-z0-9/_\-.]+$/.test(body.coverR2Key)
    ? body.coverR2Key : null;
  const candidate = {
    title,
    excerpt: String(body?.excerpt || ""),
    bodyMarkdown: String(body?.bodyMarkdown || ""),
    category,
    tags,
    sources,
    media,
    coverR2Key: cover,
  };
  const warnings = editorialWarnings(candidate);
  if (requestedStatus === "published" && warnings.length && body?.overrideWarnings !== true) {
    return json({ ok:false, error:"editorial_review_required", warnings, canOverride:true }, 409);
  }

  const editorialAction = ["KEEP","REWRITE","MOVE","ARCHIVE","REMOVE_DUPLICATE"].includes(body?.editorialAction)
    ? body.editorialAction : "KEEP";
  const reviewRequired = warnings.some(x => x.severity === "review" || x.severity === "error") ? 1 : 0;
  try {
    const r = await env.DB.prepare(
      "INSERT INTO manual_posts (slug,title,title_en,excerpt,excerpt_en,body_markdown,body_markdown_en," +
      "language,category,tags_json,cover_r2_key,status,published_at,sources_json,media_json,editorial_action," +
      "editorial_notes,review_required,archived_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(
      slug,
      title,
      String(body?.titleEn || "").slice(0, 300),
      String(body?.excerpt || "").slice(0, 1000),
      String(body?.excerptEn || "").slice(0, 1000),
      String(body?.bodyMarkdown || ""),
      String(body?.bodyMarkdownEn || ""),
      language,
      category,
      JSON.stringify(tags),
      cover,
      requestedStatus,
      publishedAt,
      JSON.stringify(sources),
      JSON.stringify(media),
      editorialAction,
      String(body?.editorialNotes || "").slice(0, 1200),
      reviewRequired,
      requestedStatus === "archived" ? new Date().toISOString() : null,
    ).run();
    return json({ ok:true, id:r.meta?.last_row_id, slug, warnings });
  } catch (error) {
    return json({ ok:false, error:"save_failed", detail:String(error) }, 400);
  }
}
