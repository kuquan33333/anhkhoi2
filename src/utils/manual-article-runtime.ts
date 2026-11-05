import MarkdownIt from "markdown-it";
import { categoryUrl } from "../constants/editorial-taxonomy";

const markdown = new MarkdownIt({ html:false, linkify:true, breaks:true, typographer:true });
let controller: AbortController | null = null;
let renderVersion = 0;

type SourceItem = { name?: string; title?: string; url?: string; type?: string };
type MediaItem = { key?: string; alt?: string; caption?: string; credit?: string };

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function showArticleError(message: string) {
  byId("ak-live-loading")?.classList.add("hidden");
  byId("ak-live-content")?.classList.add("hidden");
  byId("ak-live-error")?.classList.remove("hidden");
  const info = byId("ak-live-error-text");
  if (info) info.textContent = message;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" + String(date.getUTCDate()).padStart(2, "0");
}

function stripLegacySources(value: string) {
  const text = String(value || "");
  const match = text.match(/^#{2,3}\s+(?:Nguồn tham khảo|Sources)\s*$/im);
  if (!match || match.index === undefined) return { body:text.trim(), sources:[] as SourceItem[] };
  const tail = text.slice(match.index + match[0].length).trim();
  const sources = tail.split("\n").map(x => x.trim()).filter(x => /^[-*]\s+/.test(x)).map(line => {
    const label = line.replace(/^[-*]\s+/, "").trim();
    const parts = label.split(/\s+[—–-]\s+/);
    return { name:parts[0] || label, title:parts.slice(1).join(" — "), url:"", type:"reference" };
  });
  return { body:text.slice(0, match.index).trim(), sources };
}

function safeSources(value: unknown, fallback: SourceItem[]) {
  if (!Array.isArray(value) || !value.length) return fallback;
  const seen = new Set<string>(), out: SourceItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as SourceItem;
    const name = String(item.name || "").trim();
    if (!name) continue;
    const title = String(item.title || "").trim();
    const url = String(item.url || "").trim();
    const key = (name + "|" + title + "|" + url).toLocaleLowerCase("vi");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, title, url, type:String(item.type || "reference") });
  }
  return out.length ? out : fallback;
}

function safeMedia(value: unknown): MediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(raw => raw && typeof raw === "object" &&
    /^admin\/[A-Za-z0-9/_\-.]+$/.test(String((raw as MediaItem).key || ""))) as MediaItem[];
}

function sourceLabel(source: SourceItem) {
  return [String(source.name || "").trim(), String(source.title || "").trim()].filter(Boolean).join(" — ");
}

function renderSources(sources: SourceItem[]) {
  const section = byId("ak-live-sources");
  const list = byId("ak-source-list");
  if (!section || !list) return;
  list.replaceChildren();
  if (!sources.length) {
    section.classList.add("hidden");
    return;
  }
  for (const source of sources) {
    const li = document.createElement("li");
    const label = sourceLabel(source);
    if (/^https?:\/\//i.test(String(source.url || ""))) {
      const a = document.createElement("a");
      a.href = String(source.url);
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      li.append(a);
    } else {
      li.textContent = label;
    }
    list.append(li);
  }
  section.classList.remove("hidden");
}

function mediaFigure(item: MediaItem) {
  const figure = document.createElement("figure");
  figure.className = "ak-inline-media";
  const img = document.createElement("img");
  img.src = "/api/media?key=" + encodeURIComponent(String(item.key || ""));
  img.alt = String(item.alt || "Ảnh minh họa bài viết");
  img.loading = "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => figure.remove());
  figure.append(img);
  const captionText = [String(item.caption || "").trim(), String(item.credit || "").trim()]
    .filter(Boolean).join(" · ");
  if (captionText) {
    const caption = document.createElement("figcaption");
    caption.textContent = captionText;
    figure.append(caption);
  }
  return figure;
}

function injectMedia(container: HTMLElement, media: MediaItem[]) {
  if (!media.length) return;
  const headings = [...container.querySelectorAll<HTMLElement>("h2")];
  media.slice(0, 3).forEach((item, index) => {
    const figure = mediaFigure(item);
    const target = headings[Math.min(headings.length - 1, index * 2 + 1)];
    if (target?.parentNode) target.parentNode.insertBefore(figure, target);
    else container.append(figure);
  });
}

function slugId(text: string, index: number) {
  const clean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return clean || "muc-" + index;
}

function buildToc(container: HTMLElement) {
  const wrap = byId("ak-live-toc-wrap");
  const nav = byId("ak-live-toc");
  if (!wrap || !nav) return;
  nav.replaceChildren();
  const headings = [...container.querySelectorAll<HTMLElement>("h2,h3")];
  if (headings.length < 3) {
    wrap.classList.add("hidden");
    return;
  }
  const used = new Set<string>();
  headings.forEach((heading, index) => {
    let id = heading.id || slugId(heading.textContent || "", index + 1);
    const base = id;
    let suffix = 2;
    while (used.has(id)) id = base + "-" + suffix++;
    used.add(id);
    heading.id = id;
    const a = document.createElement("a");
    a.href = "#" + id;
    a.dataset.level = heading.tagName === "H3" ? "3" : "2";
    a.textContent = heading.textContent || "Mục " + (index + 1);
    nav.append(a);
  });
  wrap.classList.remove("hidden");
}

function updateReadingProgress() {
  const article = byId("ak-live-article");
  const bar = document.querySelector<HTMLElement>("#ak-reading-progress span");
  if (!article || !bar || byId("ak-live-content")?.classList.contains("hidden")) {
    if (bar) bar.style.width = "0%";
    return;
  }
  const rect = article.getBoundingClientRect();
  const total = Math.max(1, article.offsetHeight - window.innerHeight * 0.6);
  const passed = Math.min(total, Math.max(0, -rect.top + 100));
  bar.style.width = Math.round(passed / total * 100) + "%";
}

function setMeta(selector: string, attr: "name" | "property", key: string, value: string) {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.append(node);
  }
  node.content = value;
}

function updateSeo(post: any, slug: string) {
  const title = ((document.documentElement.dataset.akLocale === "en" ? post.title_en || post.title : post.title) || "Bài viết").trim();
  const description = ((document.documentElement.dataset.akLocale === "en" ? post.excerpt_en || post.excerpt : post.excerpt) || title).trim();
  const canonicalUrl = new URL("/bai-viet/?slug=" + encodeURIComponent(slug), location.origin).toString();
  const imageUrl = /^admin\/[A-Za-z0-9/_\-.]+$/.test(String(post.cover_r2_key || ""))
    ? new URL("/api/media?key=" + encodeURIComponent(post.cover_r2_key), location.origin).toString()
    : new URL("/assets/anhkhoi-cover.webp", location.origin).toString();

  document.title = title + " - Anh Khôi AI Media";
  setMeta('meta[name="description"]', "name", "description", description);
  setMeta('meta[property="og:title"]', "property", "og:title", document.title);
  setMeta('meta[property="og:description"]', "property", "og:description", description);
  setMeta('meta[property="og:type"]', "property", "og:type", "article");
  setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
  setMeta('meta[property="og:image"]', "property", "og:image", imageUrl);
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", document.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;

  let jsonLd = document.getElementById("ak-article-jsonld") as HTMLScriptElement | null;
  if (!jsonLd) {
    jsonLd = document.createElement("script");
    jsonLd.id = "ak-article-jsonld";
    jsonLd.type = "application/ld+json";
    document.head.append(jsonLd);
  }
  jsonLd.textContent = JSON.stringify({
    "@context":"https://schema.org",
    "@type":"Article",
    headline:title,
    description,
    image:[imageUrl],
    author:{"@type":"Person",name:"Anh Khôi"},
    publisher:{"@type":"Organization",name:"Anh Khôi AI Media"},
    datePublished:post.published_at || post.created_at,
    dateModified:post.updated_at || post.published_at || post.created_at,
    mainEntityOfPage:canonicalUrl,
  });
}

async function renderRelated(category: string, currentSlug: string) {
  const section = byId("ak-related");
  const list = byId("ak-related-list");
  if (!section || !list || !category) return;
  list.replaceChildren();
  try {
    const params = new URLSearchParams({ category, limit:"5", offset:"0" });
    const response = await fetch("/api/manual-posts?" + params.toString(), { headers:{Accept:"application/json"} });
    if (!response.ok) return;
    const data = await response.json();
    const posts = (Array.isArray(data.posts) ? data.posts : []).filter((p:any) => p.slug !== currentSlug).slice(0,4);
    if (!posts.length) return;
    for (const post of posts) {
      const a = document.createElement("a");
      a.className = "ak-related-link";
      a.href = "/bai-viet/?slug=" + encodeURIComponent(post.slug);
      a.textContent = post.title;
      list.append(a);
    }
    section.classList.remove("hidden");
  } catch {
    section.classList.add("hidden");
  }
}

export async function mountManualArticle(force = false) {
  const article = byId("ak-live-article");
  if (!article) {
    controller?.abort();
    return;
  }
  const slug = new URL(location.href).searchParams.get("slug") || "";
  if (!force && article.dataset.loadedSlug === slug) return;
  article.dataset.loadedSlug = slug;
  const localVersion = ++renderVersion;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;

  byId("ak-live-loading")?.classList.remove("hidden");
  byId("ak-live-error")?.classList.add("hidden");
  byId("ak-live-content")?.classList.add("hidden");
  byId("ak-related")?.classList.add("hidden");

  if (!slug || slug.length > 120) {
    showArticleError("Đường dẫn bài viết không hợp lệ. Bạn có thể quay lại danh sách bài viết.");
    return;
  }

  try {
    const response = await fetch("/api/manual-posts/" + encodeURIComponent(slug), {
      headers:{Accept:"application/json"},
      signal,
    });
    const result = await response.json().catch(() => ({}));
    if (response.status === 410 && result?.archived) {
      location.replace(String(result.redirect || "/archive/"));
      return;
    }
    if (!response.ok) {
      showArticleError(response.status === 404
        ? "Bài viết chưa được xuất bản, đã được lưu trữ hoặc không tồn tại."
        : "Không thể kết nối đến máy chủ. Hãy thử tải lại.");
      return;
    }
    const post = result.post;
    if (!post) throw new Error("missing-post");
    if (signal.aborted || localVersion !== renderVersion || !article.isConnected ||
        new URL(location.href).searchParams.get("slug") !== slug) return;

    const title = byId("ak-live-title");
    if (title) {
      title.dataset.akVi = post.title || "Bài viết";
      title.dataset.akEn = post.title_en || post.title || "Article";
      title.textContent = document.documentElement.dataset.akLocale === "en"
        ? (title.dataset.akEn ?? "") : (title.dataset.akVi ?? "");
    }

    const excerpt = byId("ak-live-excerpt");
    if (excerpt) {
      excerpt.dataset.akVi = post.excerpt || "";
      excerpt.dataset.akEn = post.excerpt_en || post.excerpt || "";
      excerpt.textContent = document.documentElement.dataset.akLocale === "en"
        ? (excerpt.dataset.akEn ?? "") : (excerpt.dataset.akVi ?? "");
      excerpt.classList.toggle("hidden", !post.excerpt && !post.excerpt_en);
    }

    const meta = byId("ak-live-meta");
    if (meta) {
      const metaPart = (label: string, sign: string, url?: string) => {
        const node = document.createElement(url ? "a" : "span");
        node.className = "ak-article-meta-part";
        if (url && node instanceof HTMLAnchorElement) node.href = url;
        const symbol = document.createElement("span");
        symbol.className = "ak-article-meta-symbol";
        symbol.textContent = sign;
        const content = document.createElement("span");
        content.textContent = label;
        node.append(symbol, content);
        return node;
      };
      meta.replaceChildren();
      if (post.published_at) meta.append(metaPart(formatDate(post.published_at), "▣"));
      if (post.updated_at && formatDate(post.updated_at) !== formatDate(post.published_at || "")) {
        meta.append(metaPart("Cập nhật " + formatDate(post.updated_at), "↻"));
      }
      meta.append(metaPart(String(post.minutes || 1) + " phút đọc", "◷"));
      const category = String(post.category || "").trim();
      meta.append(metaPart(category || "Chưa phân loại", "▤", category ? categoryUrl(category) : "/archive/?uncategorized=true"));

      const tags = Array.isArray(post.tags) ? post.tags : [];
      const tagsWrap = document.createElement("span");
      tagsWrap.className = "ak-article-meta-tags";
      const badge = document.createElement("span");
      badge.className = "ak-article-meta-symbol";
      badge.textContent = "#";
      tagsWrap.append(badge);
      if (tags.length) tags.forEach((tag: string, index: number) => {
        if (index) tagsWrap.append(document.createTextNode(" / "));
        const link = document.createElement("a");
        link.href = "/archive/?tag=" + encodeURIComponent(tag);
        link.textContent = tag;
        tagsWrap.append(link);
      });
      else tagsWrap.append(document.createTextNode("Chưa có tag"));
      meta.append(tagsWrap);
    }

    const figure = byId("ak-live-figure");
    const cover = byId("ak-live-cover") as HTMLImageElement | null;
    if (cover && figure) {
      if (/^admin\/[A-Za-z0-9/_\-.]+$/.test(post.cover_r2_key || "")) {
        cover.src = "/api/media?key=" + encodeURIComponent(post.cover_r2_key);
        cover.alt = post.title || "Ảnh bìa bài viết";
        figure.classList.remove("hidden");
      } else {
        cover.removeAttribute("src");
        figure.classList.add("hidden");
      }
    }

    const legacyVi = stripLegacySources(post.body_markdown || "");
    const legacyEn = stripLegacySources(post.body_markdown_en || post.body_markdown || "");
    const sources = safeSources(post.sources, legacyVi.sources);
    const media = safeMedia(post.media);
    const body = byId("ak-live-body");
    if (body) {
      const vi = document.createElement("div");
      vi.className = "ak-lang-vi";
      vi.innerHTML = markdown.render(legacyVi.body);
      injectMedia(vi, media);
      const en = document.createElement("div");
      en.className = "ak-lang-en";
      en.innerHTML = markdown.render(legacyEn.body);
      injectMedia(en, media);
      body.replaceChildren(vi, en);
      buildToc(document.documentElement.dataset.akLocale === "en" ? en : vi);
    }
    renderSources(sources);

    const tags = byId("ak-live-tags");
    if (tags) {
      tags.replaceChildren();
      for (const tag of Array.isArray(post.tags) ? post.tags : []) {
        const chip = document.createElement("a");
        chip.href = "/archive/?tag=" + encodeURIComponent(String(tag));
        chip.className = "px-3 py-1 rounded-full text-xs font-bold bg-[var(--btn-regular-bg)] text-[var(--text-75)]";
        chip.textContent = "#" + String(tag);
        tags.append(chip);
      }
    }

    updateSeo(post, slug);
    byId("ak-live-loading")?.classList.add("hidden");
    byId("ak-live-content")?.classList.remove("hidden");
    updateReadingProgress();
    void renderRelated(String(post.category || ""), slug);
  } catch {
    if (signal.aborted || localVersion !== renderVersion) return;
    showArticleError("Không thể tải nội dung lúc này. Hãy kiểm tra kết nối và thử lại.");
  }
}

function boot() {
  void mountManualArticle();
  updateReadingProgress();
}
if (!(window as any).__akReadingProgressBound) {
  (window as any).__akReadingProgressBound = true;
  window.addEventListener("scroll", updateReadingProgress, { passive:true });
  window.addEventListener("resize", updateReadingProgress);
}
document.addEventListener("DOMContentLoaded", boot);
document.addEventListener("swup:page:view", boot);
document.addEventListener("astro:page-load", boot);
document.addEventListener("popstate", boot);
document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof Element) || !target.closest("#ak-live-retry")) return;
  const article = byId("ak-live-article");
  if (article) delete article.dataset.loadedSlug;
  void mountManualArticle(true);
});
if (document.readyState !== "loading") boot();
