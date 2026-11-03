
const FB_HOST_SUFFIX = "facebook.com";
const DEFAULT_LIMIT = 20;

function isFacebookHost(hostname) {
  return hostname === "facebook.com" || hostname.endsWith("." + FB_HOST_SUFFIX);
}


function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function unescapeFacebookHtml(value) {
  return htmlDecode(value)
    .replace(/\\u0025/gi, "%")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u002f/gi, "/")
    .replace(/\\u003a/gi, ":")
    .replace(/\\u002d/gi, "-")
    .replace(/\\u005c/gi, "\\")
    .replace(/\\\//g, "/");
}

function stripTags(html) {
  return htmlDecode(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
  ).trim();
}

function attr(tag, name) {
  const re = new RegExp("\\\\b" + name + "\\\\s*=\\\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\\\s>]+))", "i");
  const m = String(tag || "").match(re);
  return htmlDecode(m ? (m[1] ?? m[2] ?? m[3] ?? "") : "");
}

function metaValueFromHtml(html, property) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = attr(tag, "property") || attr(tag, "name");
    if (key.toLowerCase() === String(property).toLowerCase()) return attr(tag, "content");
  }
  return "";
}

function canonicalFromHtml(html) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if ((attr(tag, "rel") || "").toLowerCase().split(/\s+/).includes("canonical")) return attr(tag, "href");
  }
  return "";
}

function normalizeFacebookUrl(raw, base) {
  try {
    const clean = unescapeFacebookHtml(raw);
    const u = new URL(clean, base);
    if (!isFacebookHost(u.hostname)) return null;
    u.protocol = "https:";
    u.hostname = "www.facebook.com";
    u.hash = "";
    const keep = new Set(["id","story_fbid","fbid","v","set"]);
    for (const key of [...u.searchParams.keys()]) {
      if (!keep.has(key)) u.searchParams.delete(key);
    }
    if (u.pathname.endsWith("/") && u.pathname !== "/") u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function classify(url) {
  const s = url.toLowerCase();
  if (/\/reel\/\d{8,}/.test(s)) return "reel";
  if (/\/videos\/\d{8,}/.test(s) || /[?&]v=\d{8,}/.test(s)) return "video";
  if (/photo\.php/.test(s) && /[?&]fbid=\d{8,}/.test(s)) return "photo";
  if (/\/posts\//.test(s) || /story_fbid=/.test(s) || /\/story\.php/.test(s) || /permalink\.php/.test(s)) return "post";
  return "unknown";
}

function isCandidate(url) {
  return !!url && classify(url) !== "unknown";
}

function looksBlocked(bodyText) {
  const t = String(bodyText || "").toLowerCase();
  return (
    (t.includes("log in") && t.includes("password")) ||
    (t.includes("đăng nhập") && t.includes("mật khẩu")) ||
    t.includes("create new account") ||
    t.includes("see more from")
  );
}

async function setting(env, key, fallback = "") {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return row?.value ?? fallback;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')"
  ).bind(key, String(value)).run();
}

async function createRun(env, trigger) {
  const result = await env.DB.prepare(
    "INSERT INTO sync_runs(trigger_type,status) VALUES(?,'running')"
  ).bind(trigger).run();
  return result.meta?.last_row_id;
}

async function finishRun(env, id, patch) {
  await env.DB.prepare(
    "UPDATE sync_runs SET finished_at=datetime('now'),status=?,discovered_count=?,inserted_count=?,updated_count=?,error_count=?,blocked_reason=?,notes=? WHERE id=?"
  ).bind(
    patch.status, patch.discovered || 0, patch.inserted || 0, patch.updated || 0,
    patch.errors || 0, patch.blockedReason || null, patch.notes || null, id
  ).run();
}

async function logError(env, runId, stage, url, code, message) {
  await env.DB.prepare(
    "INSERT INTO sync_errors(sync_run_id,stage,url,code,message) VALUES(?,?,?,?,?)"
  ).bind(runId, stage, url || null, code || null, String(message).slice(0, 4000)).run();
}

async function browserContent(env, url) {
  const response = await env.BROWSER.quickAction("content", {
    url,
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 20000 },
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error("browser_http_" + response.status + ": " + txt.slice(0, 800));
  }
  const payload = await response.json();
  if (!payload?.success || typeof payload.result !== "string") throw new Error("browser_action_failed");
  return payload.result;
}

function facebookContentId(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const m = path.match(/\/(?:reel|videos)\/(\d{8,})(?:\/|$)/i);
    if (m) return m[1];
    const q = u.searchParams.get("v") || u.searchParams.get("story_fbid") || u.searchParams.get("fbid");
    return q && /^\d{8,}$/.test(q) ? q : null;
  } catch { return null; }
}

function addCandidate(map, raw, baseUrl, text = "", extra = {}) {
  const normalized = normalizeFacebookUrl(raw, baseUrl);
  if (!isCandidate(normalized)) return;
  const incoming = {
    permalink: normalized,
    itemType: classify(normalized),
    facebookId: facebookContentId(normalized),
    anchorText: String(text || "").trim().slice(0, 1000),
    thumbnailUrl: extra.thumbnailUrl || null,
    viewLabel: extra.viewLabel || null,
  };
  const existing = map.get(normalized);
  if (!existing) {
    map.set(normalized, incoming);
    return;
  }
  map.set(normalized, {
    ...existing,
    anchorText: existing.anchorText || incoming.anchorText,
    thumbnailUrl: existing.thumbnailUrl || incoming.thumbnailUrl,
    viewLabel: existing.viewLabel || incoming.viewLabel,
  });
}

function discoverFromHtml(html, baseUrl) {
  const seen = new Map();
  const clean = unescapeFacebookHtml(html);

  // Reel grid exposes permalink, thumbnail and public view count in one rendered page.
  const reelTile = /<a\b[^>]*aria-label=["']Reel tile preview["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let tile;
  while ((tile = reelTile.exec(clean)) !== null) {
    const inner = tile[2] || "";
    const imgTag = (inner.match(/<img\b[^>]*>/i) || [])[0] || "";
    const thumbnailUrl = attr(imgTag, "src") || null;
    const visibleText = stripTags(inner);
    const viewMatch = visibleText.match(/\b\d+(?:[.,]\d+)?\s*(?:K|M|B)?\b/i);
    addCandidate(seen, tile[1], baseUrl, "", {
      thumbnailUrl,
      viewLabel: viewMatch ? viewMatch[0].replace(/\s+/g, "") : null,
    });
  }

  for (const tag of clean.match(/<a\b[^>]*>/gi) || []) {
    addCandidate(seen, attr(tag, "href"), baseUrl);
  }

  // Facebook often serializes public permalinks in page data even when a login overlay is rendered.
  const absolute = /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?:reel\/\d{8,}|[^"'<>\\\s]+\/videos\/\d{8,}|watch\/?\?[^"'<>\\\s]*v=\d{8,}|[^"'<>\\\s]+\/posts\/[^"'<>\\\s]+|photo\.php\?[^"'<>\\\s]*fbid=\d{8,}|story\.php\?[^"'<>\\\s]*story_fbid=\d{8,}|permalink\.php\?[^"'<>\\\s]*story_fbid=\d{8,})/gi;
  for (const match of clean.match(absolute) || []) addCandidate(seen, match, baseUrl);

  const relative = /(?:href=["']?)?(\/(?:reel\/\d{8,}|[^"'<>\\\s]+\/videos\/\d{8,}|watch\/?\?[^"'<>\\\s]*v=\d{8,}|[^"'<>\\\s]+\/posts\/[^"'<>\\\s]+|photo\.php\?[^"'<>\\\s]*fbid=\d{8,}|story\.php\?[^"'<>\\\s]*story_fbid=\d{8,}|permalink\.php\?[^"'<>\\\s]*story_fbid=\d{8,}))/gi;
  let m;
  while ((m = relative.exec(clean)) !== null) addCandidate(seen, m[1], baseUrl);

  return [...seen.values()];
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

function detailFromHtml(html, url) {
  const canonical = metaValueFromHtml(html, "og:url") || canonicalFromHtml(html) || url;
  return {
    canonical: normalizeFacebookUrl(canonical, url) || url,
    title: metaValueFromHtml(html, "og:title"),
    description: metaValueFromHtml(html, "og:description"),
    image: metaValueFromHtml(html, "og:image"),
    video: metaValueFromHtml(html, "og:video") || metaValueFromHtml(html, "og:video:url"),
    publishedAt: metaValueFromHtml(html, "article:published_time") || null,
    blocked: looksBlocked(stripTags(html).slice(0, 15000)),
  };
}

async function detail(env, url) {
  return detailFromHtml(await browserContent(env, url), url);
}

async function cacheImage(env, sourceUrl, fingerprint) {
  if (!sourceUrl) return null;
  let u;
  try { u = new URL(sourceUrl); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!(host.endsWith("fbcdn.net") || host.endsWith("facebook.com") || host.endsWith("fbsbx.com"))) return null;
  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; AnhKhoiMediaBot/1.0)" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length && length > 5_000_000) return null;
    const buf = await response.arrayBuffer();
    if (buf.byteLength > 5_000_000) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const key = "facebook/" + fingerprint.slice(0, 2) + "/" + fingerprint + "." + ext;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
    return key;
  } catch {
    return null;
  }
}

async function upsertItem(env, candidate, details, sourceUrl, status) {
  const permalink = details?.canonical || candidate.permalink;
  const facebookId = candidate.facebookId || facebookContentId(permalink);
  const fingerprint = await sha256Hex(permalink);
  const sourceKey = candidate.permalink;
  const caption = (details?.description || candidate.anchorText || details?.title || "").slice(0, 20000);
  const thumbnailUrl = details?.image || candidate.thumbnailUrl || null;

  const existing = await env.DB.prepare(
    "SELECT id,status,r2_thumbnail_key FROM facebook_items WHERE source_key=? OR (? IS NOT NULL AND facebook_id=?) LIMIT 1"
  ).bind(sourceKey, facebookId, facebookId).first();

  let r2Key = existing?.r2_thumbnail_key || null;
  if (thumbnailUrl && !r2Key) r2Key = await cacheImage(env, thumbnailUrl, fingerprint);

  const rawObject = {
    sourceUrl,
    viewLabel: candidate.viewLabel || null,
    title: details?.title || "",
    video: details?.video || "",
  };
  const rawJson = JSON.stringify(rawObject).slice(0, 50000);
  const detectedEmbedStatus = details?.video ? "detected" : null;

  if (existing) {
    await env.DB.prepare(
      "UPDATE facebook_items SET " +
      "facebook_id=COALESCE(facebook_id,?), " +
      "item_type=?, " +
      "caption=CASE WHEN ?<>'' THEN ? ELSE caption END, " +
      "permalink=?, " +
      "published_at=COALESCE(?,published_at), " +
      "last_seen_at=datetime('now'), " +
      "thumbnail_url=COALESCE(?,thumbnail_url), " +
      "r2_thumbnail_key=COALESCE(?,r2_thumbnail_key), " +
      "embed_url=COALESCE(?,embed_url), " +
      "embed_status=COALESCE(?,embed_status), " +
      "status=CASE WHEN status='shadow' AND ?<>'shadow' THEN ? ELSE status END, " +
      "raw_json=? " +
      "WHERE id=?"
    ).bind(
      facebookId, candidate.itemType, caption, caption, permalink, details?.publishedAt || null,
      thumbnailUrl, r2Key, permalink || null, detectedEmbedStatus,
      status, status, rawJson, existing.id
    ).run();
    return "updated";
  }

  await env.DB.prepare(
    "INSERT INTO facebook_items(source_key,facebook_id,permalink,item_type,caption,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,status,fingerprint,raw_json) " +
    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    sourceKey, facebookId, permalink, candidate.itemType, caption, details?.publishedAt || null,
    thumbnailUrl, r2Key, permalink, detectedEmbedStatus || "unknown", status, fingerprint, rawJson
  ).run();
  return "inserted";
}

function mobileVariant(url) {
  try {
    const u = new URL(url);
    u.hostname = "m.facebook.com";
    return u.toString();
  } catch { return url; }
}

async function enrichOnePending(env, runId, itemStatus) {
  const row = await env.DB.prepare(
    "SELECT id,source_key,facebook_id,permalink,item_type,caption,thumbnail_url,published_at " +
    "FROM facebook_items WHERE status IN ('shadow','draft','published') " +
    "AND (caption='' OR caption IS NULL OR published_at IS NULL) " +
    "ORDER BY CASE WHEN caption='' OR caption IS NULL THEN 0 ELSE 1 END, first_seen_at ASC LIMIT 1"
  ).first();

  if (!row) {
    await finishRun(env, runId, { status: "success", notes: "No pending Facebook item needs metadata enrichment." });
    return { ok: true, status: "success", runId, enriched: 0 };
  }

  try {
    const details = await detail(env, row.permalink);
    const candidate = {
      permalink: row.source_key || row.permalink,
      facebookId: row.facebook_id || facebookContentId(row.permalink),
      itemType: row.item_type,
      anchorText: row.caption || "",
      thumbnailUrl: row.thumbnail_url || null,
      viewLabel: null,
    };
    await upsertItem(env, candidate, details, row.permalink, itemStatus);
    await finishRun(env, runId, {
      status: "success", discovered: 1, updated: 1,
      notes: "Enriched one existing Facebook item with permalink metadata."
    });
    return { ok: true, status: "success", runId, enriched: 1, itemId: row.id };
  } catch (error) {
    await logError(env, runId, "enrich", row.permalink, "DETAIL_ERROR", String(error));
    await finishRun(env, runId, {
      status: "partial", discovered: 1, errors: 1,
      notes: "Metadata enrichment was deferred after a Browser Run error."
    });
    return { ok: false, status: "partial", runId, enriched: 0, error: String(error) };
  }
}

async function sync(env, trigger = "cron") {
  const enabled = (await setting(env, "facebook_sync_enabled", "true")) === "true";
  const pauseUntil = await setting(env, "sync_pause_until", "");
  if (pauseUntil) {
    const iso = pauseUntil.includes("T") ? pauseUntil : pauseUntil.replace(" ", "T") + "Z";
    const untilMs = Date.parse(iso);
    if (Number.isFinite(untilMs) && untilMs > Date.now()) {
      return { ok: true, status: "paused", pauseUntil };
    }
  }

  const runId = await createRun(env, trigger);
  if (!enabled) {
    await finishRun(env, runId, { status: "disabled", notes: "facebook_sync_enabled=false" });
    return { ok: true, status: "disabled", runId };
  }

  const profile = await setting(env, "facebook_profile_url");
  const reels = await setting(env, "facebook_reels_url");
  const shadow = (await setting(env, "facebook_shadow_mode", "true")) === "true";
  const autoPublish = (await setting(env, "facebook_auto_publish", "true")) === "true";
  const itemStatus = shadow ? "shadow" : (autoPublish ? "published" : "draft");
  const maxItems = Math.min(Math.max(Number(await setting(env, "crawler_max_items_per_run", String(DEFAULT_LIMIT))) || DEFAULT_LIMIT, 1), 50);

  let sources;
  if (trigger === "cron") {
    const now = new Date();
    const minute = now.getUTCMinutes();
    const hour = now.getUTCHours();

    if (minute < 30 && hour % 6 !== 0) {
      return enrichOnePending(env, runId, itemStatus);
    }

    // Probe the normal profile only every 6 hours because Facebook currently
    // shows a login wall to unauthenticated browsers. Other :00 runs enrich metadata.
    sources = [minute < 30 ? profile : reels].filter(Boolean);
  } else {
    // A manual admin sync prioritizes discovery and uses only one Browser Run.
    sources = [reels].filter(Boolean);
  }

  let discovered = 0, inserted = 0, updated = 0, errors = 0;
  let blockedReason = null;
  const all = new Map();

  for (const source of sources) {
    if (!source) continue;
    try {
      let html = await browserContent(env, source);
      let body = stripTags(html).slice(0, 15000);
      let found = discoverFromHtml(html, source);
      if (looksBlocked(body) && found.length === 0 && trigger !== "cron") {
        const fallback = mobileVariant(source);
        html = await browserContent(env, fallback);
        body = stripTags(html).slice(0, 15000);
        found = discoverFromHtml(html, fallback);
      }
      if (looksBlocked(body) && found.length === 0) {
        blockedReason = "Facebook returned a login wall and exposed no public post permalinks to an unauthenticated browser.";
        await logError(env, runId, "discover", source, "LOGIN_WALL", blockedReason);
        errors++;
        continue;
      }
      for (const c of found) if (!all.has(c.permalink)) all.set(c.permalink, { ...c, sourceUrl: source });
    } catch (error) {
      errors++;
      await logError(env, runId, "discover", source, "BROWSER_ERROR", String(error));
    }
  }

  const candidates = [...all.values()].slice(0, maxItems);
  discovered = candidates.length;
  // Enrich only a small number of items per run to stay under Browser Run limits.
  // Existing shadow items with missing caption/thumbnail are progressively enriched.
  const detailBudget = 0;
  let detailed = 0;

  for (const candidate of candidates) {
    try {
      const exists = await env.DB.prepare(
        "SELECT id,caption,thumbnail_url,published_at FROM facebook_items WHERE source_key=? OR (? IS NOT NULL AND facebook_id=?) LIMIT 1"
      ).bind(candidate.permalink, candidate.facebookId || null, candidate.facebookId || null).first();
      let details = null;
      const needsDetails = !exists || !exists.caption || !exists.thumbnail_url || !exists.published_at;
      if (needsDetails && detailed < detailBudget) {
        detailed++;
        try {
          details = await detail(env, candidate.permalink);
        } catch (e) {
          await logError(env, runId, "detail", candidate.permalink, "DETAIL_ERROR", String(e));
          errors++;
        }
      }
      const result = await upsertItem(env, candidate, details, candidate.sourceUrl, itemStatus);
      if (result === "inserted") inserted++; else updated++;
    } catch (error) {
      errors++;
      await logError(env, runId, "upsert", candidate.permalink, "DB_ERROR", String(error));
    }
  }

  const status = blockedReason && discovered === 0 ? "blocked" : (errors ? "partial" : "success");
  await finishRun(env, runId, {
    status, discovered, inserted, updated, errors, blockedReason,
    notes: shadow ? "Shadow mode: collected items are not public." : "Live mode."
  });
  await setSetting(env, "facebook_last_sync_at", new Date().toISOString());
  return { ok: status !== "blocked", status, runId, discovered, inserted, updated, errors, blockedReason, shadow };
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(sync(env, "cron"));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const last = await env.DB.prepare(
        "SELECT id,status,started_at,finished_at,discovered_count,inserted_count,error_count,blocked_reason FROM sync_runs ORDER BY id DESC LIMIT 1"
      ).first();
      return Response.json({ ok: true, worker: "anhkhoi-facebook-sync", last });
    }
    if (url.pathname === "/run" && request.method === "POST") {
      const trigger = request.headers.get("x-sync-trigger") === "admin" ? "admin" : "manual";
      const result = await sync(env, trigger);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }
    return new Response("Not found", { status: 404 });
  },
};
