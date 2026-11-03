
const FB_HOST_SUFFIX = "facebook.com";
const DEFAULT_LIMIT = 20;

function isFacebookHost(hostname) {
  return hostname === "facebook.com" || hostname.endsWith("." + FB_HOST_SUFFIX);
}

function textOfGroup(scraped, selector) {
  const group = (scraped || []).find(x => x.selector === selector);
  return (group?.results || []).map(x => x.text || "").filter(Boolean);
}

function attrs(result) {
  return Object.fromEntries((result?.attributes || []).map(x => [x.name, x.value]));
}

function metaValue(scraped, selector, name = "content") {
  const group = (scraped || []).find(x => x.selector === selector);
  const first = group?.results?.[0];
  return first ? (attrs(first)[name] || first.text || "") : "";
}

function normalizeFacebookUrl(raw, base) {
  try {
    const u = new URL(raw, base);
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
  if (/\/reel\/\d+/.test(s)) return "reel";
  if (/\/videos\/\d+/.test(s) || /\/watch/.test(s) || /[?&]v=\d+/.test(s)) return "video";
  if (/photo\.php/.test(s) || /[?&]fbid=\d+/.test(s)) return "photo";
  if (/\/posts\//.test(s) || /story_fbid=/.test(s) || /\/story\.php/.test(s) || /permalink\.php/.test(s)) return "post";
  return "unknown";
}

function isCandidate(url) {
  if (!url) return false;
  const type = classify(url);
  return type !== "unknown";
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

async function browserScrape(env, url) {
  const response = await env.BROWSER.quickAction("scrape", {
    url,
    elements: [
      { selector: "body" },
      { selector: "a" },
      { selector: 'meta[property="og:title"]' },
      { selector: 'meta[property="og:description"]' },
      { selector: 'meta[property="og:image"]' },
      { selector: 'meta[property="og:url"]' },
      { selector: 'meta[property="og:video"]' },
      { selector: 'meta[property="article:published_time"]' },
      { selector: 'link[rel="canonical"]' },
    ],
    gotoOptions: { waitUntil: "domcontentloaded", timeout: 20000 },
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error("browser_http_" + response.status + ": " + txt.slice(0, 800));
  }
  const payload = await response.json();
  if (payload?.success === false) throw new Error("browser_action_failed");
  return payload?.result || payload || [];
}

function discover(scraped, baseUrl) {
  const group = (scraped || []).find(x => x.selector === "a");
  const seen = new Map();
  for (const a of group?.results || []) {
    const href = attrs(a).href;
    const normalized = normalizeFacebookUrl(href, baseUrl);
    if (!isCandidate(normalized)) continue;
    if (!seen.has(normalized)) {
      seen.set(normalized, {
        permalink: normalized,
        itemType: classify(normalized),
        anchorText: String(a.text || "").trim().slice(0, 1000),
      });
    }
  }
  return [...seen.values()];
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function detail(env, url) {
  const scraped = await browserScrape(env, url);
  const canonical = metaValue(scraped, 'meta[property="og:url"]') ||
    metaValue(scraped, 'link[rel="canonical"]', "href") || url;
  return {
    canonical: normalizeFacebookUrl(canonical, url) || url,
    title: metaValue(scraped, 'meta[property="og:title"]'),
    description: metaValue(scraped, 'meta[property="og:description"]'),
    image: metaValue(scraped, 'meta[property="og:image"]'),
    video: metaValue(scraped, 'meta[property="og:video"]'),
    publishedAt: metaValue(scraped, 'meta[property="article:published_time"]') || null,
    blocked: looksBlocked(textOfGroup(scraped, "body").join("\n").slice(0, 12000)),
  };
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
  const fingerprint = await sha256Hex(permalink);
  const sourceKey = permalink;
  const caption = (details?.description || candidate.anchorText || details?.title || "").slice(0, 20000);
  const thumbnailUrl = details?.image || null;
  let r2Key = null;
  if (thumbnailUrl) r2Key = await cacheImage(env, thumbnailUrl, fingerprint);

  const existing = await env.DB.prepare("SELECT id FROM facebook_items WHERE source_key=? LIMIT 1").bind(sourceKey).first();
  if (existing) {
    await env.DB.prepare(
      "UPDATE facebook_items SET item_type=?,caption=?,permalink=?,published_at=COALESCE(?,published_at),last_seen_at=datetime('now')," +
      "thumbnail_url=COALESCE(?,thumbnail_url),r2_thumbnail_key=COALESCE(?,r2_thumbnail_key),embed_url=?,embed_status=?,raw_json=? WHERE id=?"
    ).bind(
      candidate.itemType, caption, permalink, details?.publishedAt || null, thumbnailUrl, r2Key,
      permalink, details?.video ? "detected" : "unknown",
      JSON.stringify({ sourceUrl, title: details?.title || "", video: details?.video || "" }).slice(0, 50000),
      existing.id
    ).run();
    return "updated";
  }

  await env.DB.prepare(
    "INSERT INTO facebook_items(source_key,permalink,item_type,caption,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,status,fingerprint,raw_json) " +
    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    sourceKey, permalink, candidate.itemType, caption, details?.publishedAt || null, thumbnailUrl, r2Key,
    permalink, details?.video ? "detected" : "unknown", status, fingerprint,
    JSON.stringify({ sourceUrl, title: details?.title || "", video: details?.video || "" }).slice(0, 50000)
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

async function sync(env, trigger = "cron") {
  const enabled = (await setting(env, "facebook_sync_enabled", "true")) === "true";
  const runId = await createRun(env, trigger);
  if (!enabled) {
    await finishRun(env, runId, { status: "disabled", notes: "facebook_sync_enabled=false" });
    return { ok: true, status: "disabled", runId };
  }

  if (trigger === "cron") {
    const backoff = Number(await setting(env, "sync_failure_backoff_minutes", "120")) || 120;
    const recent = await env.DB.prepare(
      "SELECT id FROM sync_runs WHERE status='blocked' AND started_at>datetime('now', ?) ORDER BY id DESC LIMIT 1"
    ).bind("-" + backoff + " minutes").first();
    if (recent) {
      await finishRun(env, runId, { status: "backoff", notes: "Recent Facebook login wall/block detected." });
      return { ok: true, status: "backoff", runId };
    }
  }

  const profile = await setting(env, "facebook_profile_url");
  const reels = await setting(env, "facebook_reels_url");
  const shadow = (await setting(env, "facebook_shadow_mode", "true")) === "true";
  const autoPublish = (await setting(env, "facebook_auto_publish", "true")) === "true";
  const itemStatus = shadow ? "shadow" : (autoPublish ? "published" : "draft");
  const maxItems = Math.min(Math.max(Number(await setting(env, "crawler_max_items_per_run", String(DEFAULT_LIMIT))) || DEFAULT_LIMIT, 1), 50);

  let sources;
  if (trigger === "cron") {
    const minute = new Date().getUTCMinutes();
    sources = [minute < 30 ? profile : reels];
  } else {
    sources = [profile, reels].filter(Boolean);
  }

  let discovered = 0, inserted = 0, updated = 0, errors = 0;
  let blockedReason = null;
  const all = new Map();

  for (const source of sources) {
    if (!source) continue;
    try {
      let scraped = await browserScrape(env, source);
      let body = textOfGroup(scraped, "body").join("\n").slice(0, 12000);
      let found = discover(scraped, source);
      if (looksBlocked(body) && found.length === 0 && trigger !== "cron") {
        const fallback = mobileVariant(source);
        scraped = await browserScrape(env, fallback);
        body = textOfGroup(scraped, "body").join("\n").slice(0, 12000);
        found = discover(scraped, fallback);
      }
      if (looksBlocked(body) && found.length === 0) {
        blockedReason = "Facebook returned a login wall to an unauthenticated browser.";
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
  const detailBudget = trigger === "admin" ? 2 : 0;
  let detailed = 0;

  for (const candidate of candidates) {
    try {
      const exists = await env.DB.prepare("SELECT id FROM facebook_items WHERE source_key=? LIMIT 1").bind(candidate.permalink).first();
      let details = null;
      if (!exists && detailed < detailBudget) {
        try { details = await detail(env, candidate.permalink); detailed++; } catch (e) {
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
