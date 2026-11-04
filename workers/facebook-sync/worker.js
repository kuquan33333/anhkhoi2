
const FB_HOST_SUFFIX = "facebook.com";
const DEFAULT_LIMIT = 40;

function isFacebookHost(hostname) {
  return hostname === "facebook.com" || hostname.endsWith("." + FB_HOST_SUFFIX);
}


function htmlDecode(value) {
  let text = String(value || "");
  // Facebook public HTML may contain numeric entities such as &#x1ebf;,
  // sometimes escaped twice as &amp;#x1ebf;. Decode before saving to D1.
  for (let pass = 0; pass < 3; pass++) {
    const next = text
      .replace(/&amp;/gi, "&")
      .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/gi, (match, hex, dec) => {
        const code = Number.parseInt(hex || dec || "", hex ? 16 : 10);
        return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)
          ? String.fromCodePoint(code) : match;
      });
    if (text === next) break;
    text = next;
  }
  return text
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
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
  // Use one RegExp escape level: the old expression matched literal \\b and \\s,
  // so <img src>, <meta content> and <a href> were often unreadable.
  const re = new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
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

function metaValuesFromHtml(html, property) {
  const values = [];
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const key = attr(tag, "property") || attr(tag, "name");
    if (key.toLowerCase() === String(property).toLowerCase()) {
      const value = attr(tag, "content");
      if (value && !values.includes(value)) values.push(value);
    }
  }
  return values;
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
  if (/(?:photo\.php|\/photo\/?)/.test(s) && /[?&]fbid=\d{8,}/.test(s)) return "photo";
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

let nextCdpCommandId = 0;

function sendCdpCommand(socket, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextCdpCommandId;
    const timeout = setTimeout(() => { cleanup(); reject(new Error('CDP command timed out: ' + method)); }, 30000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
    };
    const onClose = () => { cleanup(); reject(new Error('CDP connection closed: ' + method)); };
    const onMessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.id !== id) return;
      cleanup();
      if (message.error) reject(new Error(message.error.message || 'CDP error'));
      else resolve(message.result || {});
    };
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch (error) { cleanup(); reject(error); }
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function browserScrollContent(env, url, maxScrolls = 8) {
  const connection = await env.BROWSER.launch();
  const response = await connection.webSocket.fetch('https://browser-binding.invalid', {
    headers: { Upgrade: 'websocket' },
  });
  if (!response.webSocket) {
    await env.BROWSER.closeSession(connection.sessionId);
    throw new Error('Browser Run did not return a WebSocket');
  }

  const socket = response.webSocket;
  socket.accept();
  try {
    await sendCdpCommand(socket, 'Page.enable');
    await sendCdpCommand(socket, 'Runtime.enable');
    await sendCdpCommand(socket, 'Page.navigate', { url });
    await delay(3500);

    let stable = 0;
    let previousCount = 0;
    const limit = Math.min(Math.max(Number(maxScrolls) || 8, 1), 30);
    for (let i = 0; i < limit; i++) {
      const evaluated = await sendCdpCommand(socket, 'Runtime.evaluate', {
        expression: "(() => { const links=[...document.querySelectorAll('a[href]')].filter(a=>/\\/(?:reel|posts|videos)\\/|photo(?:\\.php|\\/)\\?|story(?:\\.php)?\\?|permalink\\.php/.test(a.getAttribute('href')||'')).length; const height=Math.max(document.body?.scrollHeight||0,document.documentElement?.scrollHeight||0); window.scrollTo(0,height); return {links,height}; })()",
        returnByValue: true,
        awaitPromise: true,
      });
      const value = evaluated?.result?.value || {};
      const count = Number(value.links || 0);
      stable = count <= previousCount ? stable + 1 : 0;
      previousCount = Math.max(previousCount, count);
      if (stable >= 4) break;
      await delay(1400);
    }

    await delay(1400);
    const cardsEval = await sendCdpCommand(socket, 'Runtime.evaluate', {
      expression: `(() => {
        const linkRx = /\\/(?:reel|posts|videos)\\/|photo(?:\\.php|\\/)\\?|story(?:\\.php)?\\?|permalink\\.php|story_fbid=/i;
        const generic = /^(?:Like|Comment|Share|Thích|Bình luận|Chia sẻ|Send|Gửi)$/i;
        const nodes = [...document.querySelectorAll('[role="article"], [data-pagelet*="FeedUnit"]')];
        return nodes.map(article => {
          const links = [...article.querySelectorAll('a[href]')];
          const a = links.find(node => linkRx.test(node.getAttribute('href') || ''));
          if (!a) return null;
          const messageNode = article.querySelector('[data-ad-preview="message"]');
          const raw = (messageNode?.innerText || article.innerText || '').trim();
          const text = raw.split('\\n').map(x => x.trim()).filter(x => x && !generic.test(x)).join('\\n').slice(0, 6000);
          const images = [...article.querySelectorAll('img[src]')]
            .filter(img => {
              const src = img.currentSrc || img.src || '';
              const rect = img.getBoundingClientRect();
              return /fbcdn\\.net/i.test(src) && rect.width >= 140 && rect.height >= 100;
            })
            .map(img => img.currentSrc || img.src)
            .filter((src, i, arr) => src && arr.indexOf(src) === i)
            .slice(0, 12);
          return { href: a.href || a.getAttribute('href'), text, images };
        }).filter(Boolean);
      })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    const htmlEval = await sendCdpCommand(socket, 'Runtime.evaluate', {
      expression: 'document.documentElement.outerHTML',
      returnByValue: true,
      awaitPromise: true,
    });
    const html = htmlEval?.result?.value;
    if (typeof html !== 'string' || html.length < 1000) throw new Error('Scrolled browser returned empty HTML');
    return {
      html,
      cards: Array.isArray(cardsEval?.result?.value) ? cardsEval.result.value : [],
    };
  } finally {
    try { socket.close(); } catch {}
    try { await env.BROWSER.closeSession(connection.sessionId); } catch {}
  }
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

function cleanCandidateText(value) {
  const text = htmlDecode(String(value || "")).replace(/\r/g, "").trim();
  if (!text) return "";
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !/^(?:Like|Comment|Share|Thích|Bình luận|Chia sẻ|Send|Gửi)$/i.test(line))
    .join("\n")
    .slice(0, 6000);
}

function addCandidate(map, raw, baseUrl, text = "", extra = {}) {
  const normalized = normalizeFacebookUrl(raw, baseUrl);
  if (!isCandidate(normalized)) return;
  const itemType = classify(normalized);
  const anchorText = cleanCandidateText(text);
  const imageUrls = [...new Set(
    (Array.isArray(extra.imageUrls) ? extra.imageUrls : [])
      .concat(extra.thumbnailUrl || [])
      .filter(Boolean)
  )].slice(0, 12);

  const verifiedByCard = !!anchorText || imageUrls.length > 0;

  const facebookId = facebookContentId(normalized);
  const incoming = {
    permalink: normalized,
    itemType,
    facebookId,
    anchorText,
    thumbnailUrl: extra.thumbnailUrl || imageUrls[0] || null,
    imageUrls,
    viewLabel: extra.viewLabel || null,
    verifiedByCard,
  };
  const key = facebookId ? "id:" + facebookId : normalized;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, incoming);
    return;
  }
  map.set(key, {
    ...existing,
    anchorText: existing.anchorText || incoming.anchorText,
    thumbnailUrl: existing.thumbnailUrl || incoming.thumbnailUrl,
    imageUrls: [...new Set([...(existing.imageUrls || []), ...incoming.imageUrls])].slice(0, 12),
    viewLabel: existing.viewLabel || incoming.viewLabel,
    verifiedByCard: existing.verifiedByCard || incoming.verifiedByCard,
  });
}

function discoverFromDomCards(cards, baseUrl, seen = new Map()) {
  for (const card of Array.isArray(cards) ? cards : []) {
    const images = Array.isArray(card?.images) ? card.images : [];
    addCandidate(seen, card?.href, baseUrl, card?.text || "", {
      thumbnailUrl: images[0] || null,
      imageUrls: images,
    });
  }
  return seen;
}

function discoverFromHtml(html, baseUrl, initialSeen) {
  const seen = initialSeen || new Map();
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
    const alt = attr(imgTag, "alt").trim();
    const caption = alt && alt.length > 10 && !/^(reel|video|facebook|ảnh đại diện)/i.test(alt) ? alt : "";
    addCandidate(seen, tile[1], baseUrl, caption, {
      thumbnailUrl,
      imageUrls: thumbnailUrl ? [thumbnailUrl] : [],
      viewLabel: viewMatch ? viewMatch[0].replace(/\s+/g, "") : null,
    });
  }

  // Bare anchors are accepted only for video/reel; addCandidate rejects bare posts/photos.
  for (const tag of clean.match(/<a\b[^>]*>/gi) || []) {
    addCandidate(seen, attr(tag, "href"), baseUrl);
  }

  // Facebook serializes many video permalinks even behind a login overlay.
  const absolute = /https?:\/\/(?:www\.|m\.)?facebook\.com\/(?:reel\/\d{8,}|[^"'<>\\\s]+\/videos\/\d{8,}|watch\/?\?[^"'<>\\\s]*v=\d{8,})/gi;
  for (const match of clean.match(absolute) || []) addCandidate(seen, match, baseUrl);

  const relative = /(?:href=["']?)?(\/(?:reel\/\d{8,}|[^"'<>\\\s]+\/videos\/\d{8,}|watch\/?\?[^"'<>\\\s]*v=\d{8,}))/gi;
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
  const width = Number(metaValueFromHtml(html, "og:video:width") || metaValueFromHtml(html, "twitter:player:width")) || null;
  const height = Number(metaValueFromHtml(html, "og:video:height") || metaValueFromHtml(html, "twitter:player:height")) || null;
  return {
    canonical: normalizeFacebookUrl(canonical, url) || url,
    title: metaValueFromHtml(html, "og:title") || metaValueFromHtml(html, "twitter:title"),
    description: metaValueFromHtml(html, "og:description") ||
      metaValueFromHtml(html, "twitter:description") ||
      metaValueFromHtml(html, "description"),
    image: metaValueFromHtml(html, "og:image") || metaValueFromHtml(html, "twitter:image"),
    images: metaValuesFromHtml(html, "og:image").slice(0, 20),
    video: metaValueFromHtml(html, "og:video") || metaValueFromHtml(html, "og:video:url"),
    mediaWidth: width,
    mediaHeight: height,
    publishedAt: metaValueFromHtml(html, "article:published_time") || null,
    blocked: looksBlocked(stripTags(html).slice(0, 15000)),
  };
}

function isGenericFacebookMetadata(details) {
  if (!details) return true;
  const text = [details.title, details.description, details.canonical].filter(Boolean).join(" ").toLowerCase();
  return (
    text.includes("khám phá các video phổ biến") ||
    text.includes("tab video là nơi để cùng thưởng thức") ||
    /facebook\.com\/watch\/?(?:\s|$)/i.test(String(details.canonical || "")) ||
    (!details.description && !details.image && /^facebook(?:\s|$)/i.test(String(details.title || "").trim()))
  );
}

function mergeCandidateDetails(candidate, details) {
  const images = [...new Set([
    ...(Array.isArray(details?.images) ? details.images : []),
    ...(Array.isArray(candidate?.imageUrls) ? candidate.imageUrls : []),
    candidate?.thumbnailUrl || null,
  ].filter(Boolean))].slice(0, 20);
  return {
    canonical: details?.canonical || candidate?.permalink || "",
    title: details?.title || "",
    description: details?.description || candidate?.anchorText || "",
    image: details?.image || candidate?.thumbnailUrl || images[0] || "",
    images,
    video: details?.video || "",
    mediaWidth: details?.mediaWidth || null,
    mediaHeight: details?.mediaHeight || null,
    publishedAt: details?.publishedAt || null,
    blocked: !!details?.blocked,
    source: details?.source || null,
  };
}

function pluginPostDetails(html, originalUrl) {
  const source = String(html || "");
  if (!source || /This post is no longer available|Nội dung này hiện không hiển thị/i.test(stripTags(source))) return null;

  const messageMatch = source.match(/<div\b[^>]*data-testid=["']post_message["'][^>]*>([\s\S]*?)<\/div>/i);
  const description = messageMatch ? stripTags(messageMatch[1]).trim() : "";

  let canonical = "";
  for (const tag of source.match(/<a\b[^>]*>/gi) || []) {
    const href = attr(tag, "href");
    if (/permalink\.php\?[^#]*story_fbid=\d{8,}/i.test(href || "")) {
      canonical = normalizeFacebookUrl(href, "https://www.facebook.com") || "";
      if (canonical) break;
    }
  }

  const images = [];
  for (const tag of source.match(/<img\b[^>]*>/gi) || []) {
    const src = attr(tag, "src");
    if (!src) continue;
    let u;
    try { u = new URL(src, "https://www.facebook.com"); } catch { continue; }
    if (!u.hostname.endsWith(".fbcdn.net")) continue;
    const cls = attr(tag, "class");
    const width = Number(attr(tag, "width") || 0);
    const height = Number(attr(tag, "height") || 0);
    // _1p6f is Facebook's embedded post media image. Width/height is a safe fallback.
    if (!/\b_1p6[fg]\b/.test(cls) && Math.max(width, height) < 180) continue;
    if (!images.includes(u.toString())) images.push(u.toString());
  }

  const time = source.match(/\bdata-utime=["'](\d{9,12})["']/i);
  let publishedAt = null;
  if (time) {
    const ms = Number(time[1]) * 1000;
    if (Number.isFinite(ms)) publishedAt = new Date(ms).toISOString();
  }

  if (!description && !images.length) return null;
  return {
    canonical: canonical || normalizeFacebookUrl(originalUrl, originalUrl) || originalUrl,
    title: "",
    description,
    image: images[0] || "",
    images: images.slice(0, 20),
    video: "",
    mediaWidth: null,
    mediaHeight: null,
    publishedAt,
    blocked: false,
    source: "facebook-post-plugin",
  };
}

async function detailPlugin(url) {
  const type = classify(url);
  if (type !== "post" && type !== "photo") return null;
  try {
    const plugin = new URL("https://www.facebook.com/plugins/post.php");
    plugin.searchParams.set("href", url);
    plugin.searchParams.set("show_text", "true");
    plugin.searchParams.set("width", "500");
    const response = await fetch(plugin.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AnhKhoiMedia/1.0; +https://anhkhoi.pages.dev/)",
        "accept-language": "vi,en;q=0.8",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    return pluginPostDetails(await response.text(), url);
  } catch {
    return null;
  }
}

async function detailHttp(url) {
  const pluginDetails = await detailPlugin(url);
  if (pluginDetails) return pluginDetails;

  const variants = [url];
  const id = facebookContentId(url);
  if (id) variants.push("https://www.facebook.com/watch/?v=" + id);
  for (const candidateUrl of [...new Set(variants)]) {
    try {
      const response = await fetch(candidateUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; AnhKhoiMedia/1.0; +https://anhkhoi.pages.dev/)",
          "accept-language": "vi,en;q=0.8",
        },
        redirect: "follow",
      });
      if (!response.ok) continue;
      const html = await response.text();
      const parsed = detailFromHtml(html, url);
      if (!isGenericFacebookMetadata(parsed) && (parsed.description || parsed.image || parsed.title)) return parsed;
    } catch {
      // Try the next public URL variant.
    }
  }
  return null;
}

async function detail(env, url) {
  const direct = await detailHttp(url);
  const usefulDirectText = !!(
    direct?.description ||
    (direct?.title && !/^facebook(?:\s|$)/i.test(direct.title.trim()))
  );
  if (usefulDirectText) return direct;

  try {
    const browser = detailFromHtml(await browserContent(env, url), url);
    if (isGenericFacebookMetadata(browser)) return direct;
    return {
      canonical: browser.canonical || direct?.canonical || url,
      title: browser.title || direct?.title || "",
      description: browser.description || direct?.description || "",
      image: browser.image || direct?.image || "",
      video: browser.video || direct?.video || "",
      images: browser.images?.length ? browser.images : (direct?.images || []),
      mediaWidth: browser.mediaWidth || direct?.mediaWidth || null,
      mediaHeight: browser.mediaHeight || direct?.mediaHeight || null,
      publishedAt: browser.publishedAt || direct?.publishedAt || null,
      blocked: browser.blocked && !direct,
    };
  } catch {
    return direct;
  }
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

async function savePublicImages(env, itemId, itemType, details) {
  if (!itemId || !details || !["post", "photo"].includes(itemType)) return;
  const urls = [...new Set(details.images || [])].slice(0, 12);
  for (let i = 0; i < urls.length; i++) {
    const source = urls[i];
    try {
      const u = new URL(source);
      if (u.protocol !== "https:" ||
          !(u.hostname.endsWith(".fbcdn.net") || u.hostname.endsWith(".facebook.com"))) continue;
      const previous = await env.DB.prepare(
        "SELECT r2_key FROM facebook_media WHERE item_id=? AND source_url=? LIMIT 1"
      ).bind(itemId, source).first();
      const fingerprint = await sha256Hex(source);
      const r2Key = previous?.r2_key || (i < 4 ? await cacheImage(env, source, fingerprint) : null);
      await env.DB.prepare(
        "INSERT INTO facebook_media(item_id,media_type,source_url,r2_key,ordinal) VALUES(?,'image',?,?,?) " +
        "ON CONFLICT(item_id,source_url) DO UPDATE SET r2_key=COALESCE(excluded.r2_key,facebook_media.r2_key),ordinal=excluded.ordinal"
      ).bind(itemId, source, r2Key, i).run();
    } catch { /* An unavailable image must never prevent publishing its post. */ }
  }
}

async function upsertItem(env, candidate, details, sourceUrl, status) {
  const isPostLike = candidate.itemType === "post" || candidate.itemType === "photo";
  const permalink = isPostLike
    ? (details?.canonical || candidate.permalink)
    : (candidate.permalink || details?.canonical);
  const facebookId = facebookContentId(permalink) || candidate.facebookId;
  const fingerprint = await sha256Hex(permalink);
  const sourceKey = permalink;
  const resolvedType = isPostLike && classify(permalink) !== "unknown"
    ? classify(permalink)
    : candidate.itemType;
  const sourceCaption = details?.description || candidate.anchorText || details?.title || "";
  const caption = /^(facebook|log in to facebook|đăng nhập vào facebook)(?:[\s.\-:]|$)/i.test(sourceCaption.trim())
    ? "" : sourceCaption.slice(0, 20000);
  const thumbnailUrl = details?.image || candidate.thumbnailUrl || null;

  const existing = await env.DB.prepare(
    "SELECT id,status,r2_thumbnail_key,raw_json FROM facebook_items WHERE source_key=? OR (? IS NOT NULL AND facebook_id=?) LIMIT 1"
  ).bind(sourceKey, facebookId, facebookId).first();

  let r2Key = existing?.r2_thumbnail_key || null;
  if (thumbnailUrl && !r2Key) r2Key = await cacheImage(env, thumbnailUrl, fingerprint);

  let previousRaw = {};
  try { previousRaw = JSON.parse(existing?.raw_json || "{}"); } catch {}
  const rawObject = {
    ...previousRaw,
    sourceUrl: sourceUrl || previousRaw.sourceUrl || null,
    viewLabel: candidate.viewLabel || previousRaw.viewLabel || null,
    title: details?.title || previousRaw.title || "",
    canonicalUrl: details?.canonical || previousRaw.canonicalUrl || null,
    video: details?.video || previousRaw.video || "",
    mediaWidth: details?.mediaWidth || previousRaw.mediaWidth || null,
    mediaHeight: details?.mediaHeight || previousRaw.mediaHeight || null,
    discoveredImages: Array.isArray(candidate.imageUrls) ? candidate.imageUrls.length : (previousRaw.discoveredImages || 0),
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
      facebookId, resolvedType, caption, caption, permalink, details?.publishedAt || null,
      thumbnailUrl, r2Key, permalink || null, detectedEmbedStatus,
      status, status, rawJson, existing.id
    ).run();
    await savePublicImages(env, existing.id, resolvedType, details);
    return "updated";
  }

  const insertion = await env.DB.prepare(
    "INSERT INTO facebook_items(source_key,facebook_id,permalink,item_type,caption,published_at,thumbnail_url,r2_thumbnail_key,embed_url,embed_status,status,fingerprint,raw_json) " +
    "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    sourceKey, facebookId, permalink, resolvedType, caption, details?.publishedAt || null,
    thumbnailUrl, r2Key, permalink, detectedEmbedStatus || "unknown", status, fingerprint, rawJson
  ).run();
  await savePublicImages(env, insertion.meta?.last_row_id, resolvedType, details);
  return "inserted";
}

function mobileVariant(url) {
  try {
    const u = new URL(url);
    u.hostname = "m.facebook.com";
    return u.toString();
  } catch { return url; }
}

async function enrichPendingBatch(env, runId, itemStatus) {
  const rows = await env.DB.prepare(
    "SELECT id,source_key,facebook_id,permalink,item_type,caption,thumbnail_url,published_at " +
    "FROM facebook_items WHERE status IN ('shadow','draft','published') " +
    "AND (caption='' OR caption IS NULL OR thumbnail_url IS NULL OR r2_thumbnail_key IS NULL) " +
    "AND (next_enrich_at IS NULL OR next_enrich_at<=datetime('now')) " +
    "ORDER BY CASE WHEN caption='' OR caption IS NULL THEN 0 ELSE 1 END, enrich_fail_count ASC, first_seen_at ASC LIMIT 3"
  ).all();

  const pending = rows.results || [];
  if (!pending.length) {
    await finishRun(env, runId, { status:"success", notes:"No pending Facebook item needs metadata enrichment." });
    return { ok:true,status:"success",runId,enriched:0 };
  }

  let updated = 0;
  let errors = 0;
  let browserFallbackUsed = false;

  for (const row of pending) {
    try {
      let details = await detailHttp(row.permalink);
      const usefulText = !!(
        details?.description ||
        (details?.title && !/^facebook(?:\s|$)/i.test(details.title.trim()))
      );
      if (!usefulText && !browserFallbackUsed) {
        browserFallbackUsed = true;
        const browserDetails = detailFromHtml(await browserContent(env, row.permalink), row.permalink);
        if (!isGenericFacebookMetadata(browserDetails)) {
          details = {
            canonical: browserDetails.canonical || details?.canonical || row.permalink,
            title: browserDetails.title || details?.title || "",
            description: browserDetails.description || details?.description || "",
            image: browserDetails.image || details?.image || "",
            video: browserDetails.video || details?.video || "",
            images: browserDetails.images?.length ? browserDetails.images : (details?.images || []),
            mediaWidth: browserDetails.mediaWidth || details?.mediaWidth || null,
            mediaHeight: browserDetails.mediaHeight || details?.mediaHeight || null,
            publishedAt: browserDetails.publishedAt || details?.publishedAt || null,
            blocked: browserDetails.blocked && !details,
          };
        }
      }
      if (!details) {
        errors++;
        await env.DB.prepare(
          "UPDATE facebook_items SET enrich_fail_count=enrich_fail_count+1,next_enrich_at=datetime('now','+6 hours') WHERE id=?"
        ).bind(row.id).run();
        await logError(env, runId, "enrich", row.permalink, "NO_METADATA", "Public metadata was unavailable; retry deferred for 6 hours.");
        continue;
      }
      const candidate = {
        permalink: row.source_key || row.permalink,
        facebookId: row.facebook_id || facebookContentId(row.permalink),
        itemType: row.item_type,
        anchorText: row.caption || "",
        thumbnailUrl: row.thumbnail_url || null,
        viewLabel: null,
      };
      await upsertItem(env, candidate, details, row.permalink, itemStatus);
      await env.DB.prepare("UPDATE facebook_items SET enrich_fail_count=0,next_enrich_at=NULL WHERE id=?").bind(row.id).run();
      updated++;
    } catch (error) {
      errors++;
      await env.DB.prepare(
        "UPDATE facebook_items SET enrich_fail_count=enrich_fail_count+1,next_enrich_at=datetime('now','+2 hours') WHERE id=?"
      ).bind(row.id).run();
      await logError(env, runId, "enrich", row.permalink, "DETAIL_ERROR", String(error));
    }
  }

  const status = errors && !updated ? "partial" : "success";
  await finishRun(env, runId, {
    status,
    discovered: pending.length,
    updated,
    errors,
    notes: "Enriched up to three Facebook items; Browser Run fallback capped at one request."
  });
  return { ok:updated>0 || !errors,status,runId,enriched:updated,errors };
}

function profileSources(profile, reels) {
  const out = [];
  if (reels) out.push(reels);
  if (profile) {
    out.push(profile);
    for (const sk of ["posts", "photos", "videos"]) {
      try {
        const u = new URL(profile);
        u.searchParams.set("sk", sk);
        out.push(u.toString());
      } catch {}
    }
  }
  return [...new Set(out.filter(Boolean))];
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
  const maxItems = Math.min(Math.max(Number(await setting(env, "crawler_max_items_per_run", String(DEFAULT_LIMIT))) || DEFAULT_LIMIT, 1), 100);
  const maxScrolls = Math.min(Math.max(Number(await setting(env, "crawler_max_scrolls", "12")) || 12, 1), 30);

  let sources;
  const allSources = profileSources(profile, reels);
  if (trigger === "cron") {
    const now = new Date();
    const minute = now.getUTCMinutes();
    const hour = now.getUTCHours();

    // :30 always refreshes Reels. Every 6 hours perform a deep public-profile
    // scan across Posts/Photos/Videos. Other :00 runs alternate a profile tab
    // with metadata enrichment. No login cookies and no Meta API.
    if (minute >= 30) {
      sources = [reels].filter(Boolean);
    } else if (hour % 6 === 0) {
      sources = allSources;
    } else if (hour % 2 === 0 && profile) {
      const tabs = ["posts", "photos", "videos"];
      const u = new URL(profile);
      u.searchParams.set("sk", tabs[Math.floor(hour / 2) % tabs.length]);
      sources = [u.toString()];
    } else {
      return enrichPendingBatch(env, runId, itemStatus);
    }
  } else {
    // Admin/manual sync is deliberately a deep scan of every public tab.
    sources = allSources;
  }

  let discovered = 0, inserted = 0, updated = 0, errors = 0;
  let blockedReason = null;
  const all = new Map();

  for (const source of sources) {
    if (!source) continue;
    try {
      let html;
      try { html = await browserScrollContent(env, source, maxScrolls); }
      catch { html = await browserContent(env, source); }
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
      for (const c of found) {
        const key = c.facebookId ? "id:" + c.facebookId : c.permalink;
        const old = all.get(key);
        if (!old) all.set(key, { ...c, sourceUrl: source });
        else all.set(key, {
          ...old,
          anchorText: old.anchorText || c.anchorText,
          thumbnailUrl: old.thumbnailUrl || c.thumbnailUrl,
          imageUrls: [...new Set([...(old.imageUrls || []), ...(c.imageUrls || [])])].slice(0, 12),
          viewLabel: old.viewLabel || c.viewLabel,
        });
      }
    } catch (error) {
      errors++;
      await logError(env, runId, "discover", source, "BROWSER_ERROR", String(error));
    }
  }

  const discoveredCandidates = [...all.values()];
  discovered = discoveredCandidates.length;
  const knownRows = await env.DB.prepare(
    "SELECT facebook_id FROM facebook_items WHERE facebook_id IS NOT NULL"
  ).all();
  const knownIds = new Set((knownRows.results || []).map(row => String(row.facebook_id)));
  const candidates = discoveredCandidates
    .sort((a, b) => Number(knownIds.has(a.facebookId || "")) - Number(knownIds.has(b.facebookId || "")))
    .slice(0, maxItems);
  // HTTP metadata enrichment is cheap enough for a limited set in discovery.
  // Browser fallback remains in the separate enrichment queue.
  const detailBudget = Math.min(32, maxItems);
  let detailed = 0;

  for (const candidate of candidates) {
    try {
      const exists = await env.DB.prepare(
        "SELECT id,caption,thumbnail_url,published_at FROM facebook_items WHERE source_key=? OR (? IS NOT NULL AND facebook_id=?) LIMIT 1"
      ).bind(candidate.permalink, candidate.facebookId || null, candidate.facebookId || null).first();
      let fetched = null;
      const candidateHasCardData = !!candidate.anchorText && !!candidate.thumbnailUrl;
      const needsDetails =
        candidate.itemType === "post" || candidate.itemType === "photo" ||
        (!candidateHasCardData && (!exists || !exists.caption || !exists.thumbnail_url));
      if (needsDetails && detailed < detailBudget) {
        detailed++;
        try {
          fetched = await detailHttp(candidate.permalink);
        } catch (e) {
          await logError(env, runId, "detail", candidate.permalink, "DETAIL_ERROR", String(e));
          errors++;
        }
      }
      const details = mergeCandidateDetails(candidate, fetched);
      const hasCaption = !!String(details.description || "").trim();
      const hasImage = !!(details.image || details.images?.length);
      const pluginVerified = fetched?.source === "facebook-post-plugin";
      if ((candidate.itemType === "photo" || candidate.itemType === "post") &&
          !pluginVerified && !candidate.verifiedByCard) {
        await logError(env, runId, "validate", candidate.permalink, "UNVERIFIED_POST_LINK",
          "Skipped a bare Facebook post/photo link because the Post Plugin exposed no public content.");
        continue;
      }
      if ((candidate.itemType === "photo" && !hasImage) ||
          (candidate.itemType === "post" && !hasCaption && !hasImage)) {
        await logError(env, runId, "validate", candidate.permalink, "NO_CARD_EVIDENCE",
          "Skipped a Facebook post/photo candidate without public caption or image evidence.");
        continue;
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
      const mode = request.headers.get("x-sync-mode") || "discover";
      if (mode === "enrich") {
        const enabled = (await setting(env, "facebook_sync_enabled", "true")) === "true";
        const runId = await createRun(env, "admin-enrich");
        if (!enabled) {
          await finishRun(env, runId, { status:"disabled", notes:"facebook_sync_enabled=false" });
          return Response.json({ ok:true,status:"disabled",runId });
        }
        const shadow = (await setting(env, "facebook_shadow_mode", "true")) === "true";
        const autoPublish = (await setting(env, "facebook_auto_publish", "true")) === "true";
        const itemStatus = shadow ? "shadow" : (autoPublish ? "published" : "draft");
        const result = await enrichPendingBatch(env, runId, itemStatus);
        return Response.json(result, { status: result.ok ? 200 : 409 });
      }
      const result = await sync(env, trigger);
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }
    return new Response("Not found", { status: 404 });
  },
};
