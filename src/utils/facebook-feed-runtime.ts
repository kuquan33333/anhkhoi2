type AkFbItem = {
  item_type?: string; caption?: string; permalink?: string; published_at?: string | null;
  thumbnail_url?: string | null; r2_thumbnail_key?: string | null; viewLabel?: string | null;
  mediaWidth?: number | null; mediaHeight?: number | null;
  media?: Array<{ type?: string; r2_key?: string | null; source_url?: string | null }>;
};
/** Decode numeric HTML entities that Facebook exposes in public captions.
 * Text is assigned using textContent, so entities cannot introduce HTML.
 */
function akDecodeFacebookCaption(input?: string | null): string {
  let text = String(input || "");
  for (let pass = 0; pass < 3; pass++) {
    const next = text
      .replace(/&amp;/gi, "&")
      .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));/gi, (match, hex: string | undefined, dec: string | undefined) => {
        const code = Number.parseInt(hex || dec || "", hex ? 16 : 10);
        return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF)
          ? String.fromCodePoint(code) : match;
      });
    if (next === text) break;
    text = next;
  }
  return text
    .replace(/&(quot|apos|lt|gt|nbsp|amp);/gi, (_match, entity: string) => {
      const map: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", amp: "&" };
      return map[entity.toLowerCase()] || _match;
    });
}

function akCreate<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = "", text?: string
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function akSafeFacebookUrl(raw?: string): boolean {
  try {
    const u = new URL(raw || "");
    return u.protocol === "https:" &&
      (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"));
  } catch { return false; }
}
function akFacebookImage(key?: string | null, fallback?: string | null) {
  if (key && /^(?:facebook|admin)\/[A-Za-z0-9/_\-.]+$/.test(key))
    return "/api/media?key=" + encodeURIComponent(key);
  try {
    const u = new URL(fallback || "");
    if (u.protocol === "https:") return u.toString();
  } catch {}
  return "/assets/anhkhoi-cover.webp";
}
function akFbAspect(item: AkFbItem): string {
  const w = Number(item.mediaWidth);
  const h = Number(item.mediaHeight);
  if (w > 0 && h > 0 && w / h >= 0.3 && w / h <= 3.5) return w + " / " + h;
  return item.item_type === "reel" ? "9 / 16" : "16 / 9";
}
function akFbDate(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? "" : new Intl.DateTimeFormat("vi-VN", {dateStyle:"medium"}).format(d);
}
function akFbImage(key?: string | null, url?: string | null, alt?: string) {
  const image = akCreate("img");
  image.src = akFacebookImage(key, url);
  image.alt = alt || "Ảnh từ Facebook Anh Khôi";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    if (!image.src.endsWith("/assets/anhkhoi-cover.webp"))
      image.src = "/assets/anhkhoi-cover.webp";
  });
  return image;
}
function akVideoShell(item: AkFbItem): HTMLElement {
  const shell = akCreate("div", "ak-runtime-player-shell");
  if (item.item_type === "reel") shell.classList.add("is-reel");
  shell.style.aspectRatio = akFbAspect(item);

  if (!akSafeFacebookUrl(item.permalink)) {
    const poster = akCreate("div", "ak-runtime-video-poster");
    poster.append(akFbImage(
      item.r2_thumbnail_key,
      item.thumbnail_url,
      akDecodeFacebookCaption(item.caption) || "Video Facebook"
    ));
    shell.append(poster);
    return shell;
  }

  // Render Facebook's real player immediately. The first visible Play control
  // belongs to Facebook itself, so the viewer only needs one click to play.
  const embedUrl = new URL("https://www.facebook.com/plugins/video.php");
  embedUrl.searchParams.set("href", item.permalink || "");
  embedUrl.searchParams.set("show_text", "false");
  embedUrl.searchParams.set("autoplay", "false");
  embedUrl.searchParams.set("width", item.item_type === "reel" ? "380" : "640");

  const player = akCreate("iframe", "ak-runtime-video-iframe");
  player.title = "Video Facebook Anh Khôi";
  player.src = embedUrl.toString();
  player.loading = "lazy";
  player.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
  player.setAttribute("allowfullscreen", "");
  player.referrerPolicy = "strict-origin-when-cross-origin";
  shell.append(player);
  return shell;
}

function akTogglePostEmbed(card: HTMLElement, item: AkFbItem, button: HTMLButtonElement) {
  const previous = card.querySelector("[data-ak-post-embed]");
  if (previous) {
    previous.remove();
    button.textContent = "Xem bài tại đây";
    button.setAttribute("aria-expanded", "false");
    return;
  }
  if (!akSafeFacebookUrl(item.permalink)) return;
  const region = akCreate("div", "ak-runtime-post-embed");
  region.dataset.akPostEmbed = "1";
  const href = new URL("https://www.facebook.com/plugins/post.php");
  href.searchParams.set("href", item.permalink || "");
  href.searchParams.set("width", String(Math.max(300, Math.min(600, Math.round(card.getBoundingClientRect().width - 32)))));
  href.searchParams.set("show_text", "true");
  const iframe = akCreate("iframe");
  iframe.title = "Bài đăng Facebook";
  iframe.src = href.toString();
  iframe.loading = "lazy";
  iframe.setAttribute("allowfullscreen", "");
  region.append(iframe);
  card.append(region);
  button.textContent = "Đóng bài nhúng";
  button.setAttribute("aria-expanded", "true");
}
function akFbCard(item: AkFbItem): HTMLElement {
  const card = akCreate("article", "ak-runtime-card");
  const isVideo = item.item_type === "video" || item.item_type === "reel";
  if (isVideo) {
    const stage = akCreate("div", "ak-runtime-video-stage");
    stage.append(akVideoShell(item));
    card.append(stage);
  } else {
    const gallery = akCreate("div", "ak-runtime-gallery");
    const attached = Array.isArray(item.media) ?
      item.media.filter(m => m && m.type === "image") : [];
    const sources = attached.length
      ? attached.map(m => ({ key: m.r2_key, url: m.source_url }))
      : [{ key: item.r2_thumbnail_key, url: item.thumbnail_url }];
    for (const src of sources.slice(0, 20)) {
      const figure = akCreate("figure", "ak-runtime-poster");
      figure.append(akFbImage(src.key, src.url, akDecodeFacebookCaption(item.caption)));
      gallery.append(figure);
    }
    card.append(gallery);
  }

  const body = akCreate("div", "ak-runtime-body");
  const labels = [String(item.item_type || "post").toUpperCase()];
  if (item.viewLabel) labels.push(item.viewLabel + " lượt xem");
  const date = akFbDate(item.published_at);
  if (date) labels.push(date);
  body.append(akCreate("div", "ak-runtime-meta", labels.join(" · ")));
  body.append(akCreate("p", "ak-runtime-caption",
    akDecodeFacebookCaption(item.caption) || "Facebook chưa cung cấp caption công khai cho nội dung này."));
  if (akSafeFacebookUrl(item.permalink)) {
    const actions = akCreate("div", "ak-runtime-actions");
    if (!isVideo) {
      const button = akCreate("button", "ak-cta", "Xem bài tại đây");
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => akTogglePostEmbed(card, item, button));
      actions.append(button);
    }
    const link = akCreate("a", "ak-runtime-link", isVideo ? "Không phát được? Xem trên Facebook ↗" : "Facebook ↗");
    link.href = item.permalink || "";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    actions.append(link);
    body.append(actions);
  }
  card.append(body);
  return card;
}

type AkFeedState = { offset: number; loading: boolean; load: () => Promise<void> };
const feedStates = new WeakMap<HTMLElement, AkFeedState>();
function akInitFacebookFeed(section: HTMLElement) {
  if (feedStates.has(section)) return;
  const grid = section.querySelector<HTMLElement>("[data-runtime-grid]");
  const more = section.querySelector<HTMLButtonElement>("[data-runtime-more]");
  const notice = section.querySelector<HTMLElement>("[data-runtime-notice]");
  if (!grid) return;
  grid.replaceChildren();
  const mode = section.dataset.mode || "home";
  const pageSize = mode === "home" ? 6 : 24;
  const endpoint = mode === "reels" ? "/api/reels" : "/api/feed";
  const state: AkFeedState = { offset: 0, loading: false, async load() {
    if (state.loading) return;
    state.loading = true;
    if (more) { more.disabled = true; more.textContent = "Đang tải…"; }
    try {
      const response = await fetch(endpoint + "?limit=" + pageSize + "&offset=" + state.offset, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("facebook-feed-failed");
      const data = await response.json();
      if (!section.isConnected) return;
      const items: AkFbItem[] = Array.isArray(data.items) ? data.items : [];
      if (!data.enabled || (!state.offset && items.length === 0)) {
        if (notice) {
          notice.textContent = data.enabled ?
            "Chưa có nội dung Facebook công khai được đồng bộ." :
            "Nguồn Facebook hiện chưa được bật hiển thị.";
          notice.classList.remove("hidden");
        }
        if (more) more.hidden = true;
        section.classList.remove("hidden");
        return;
      }
      if (notice) notice.classList.add("hidden");
      grid.append(...items.map(akFbCard));
      state.offset = Number(data.nextOffset) || state.offset + items.length;
      if (more) more.hidden = !data.hasMore;
      section.classList.remove("hidden");
    } catch {
      if (notice) {
        notice.textContent = "Không tải được nội dung lúc này. Hãy thử lại.";
        notice.classList.remove("hidden");
      }
      section.classList.remove("hidden");
      if (more) more.hidden = false;
    } finally {
      state.loading = false;
      if (more) { more.disabled = false; more.textContent = "Xem thêm bài đăng"; }
    }
  }};
  feedStates.set(section, state);
  more?.addEventListener("click", () => { void state.load(); });
  void state.load();
}
function akStartFacebookFeeds() {
  document.querySelectorAll<HTMLElement>("[data-ak-runtime-feed]").forEach(akInitFacebookFeed);
}
document.addEventListener("DOMContentLoaded", akStartFacebookFeeds);
document.addEventListener("swup:page:view", akStartFacebookFeeds);
document.addEventListener("astro:page-load", akStartFacebookFeeds);
document.addEventListener("swup:visit:start", () => {
  if (activeVideo) akResetVideo(activeVideo);
});
if (document.readyState !== "loading") akStartFacebookFeeds();
