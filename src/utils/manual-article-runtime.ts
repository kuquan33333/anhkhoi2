import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: true });
let controller: AbortController | null = null;
let renderVersion = 0;
const RETURN_KEY = "anhkhoi.article.return";

function byId(id: string): HTMLElement | null {
  return document.getElementById(id);
}
function isSafeBackTarget(candidate: string): boolean {
  try {
    const next = new URL(candidate, location.origin);
    return next.origin === location.origin &&
      (next.pathname === "/" || next.pathname.startsWith("/archive/") ||
       /^\/\d+\/$/.test(next.pathname)) &&
      !next.href.includes("javascript:");
  } catch { return false; }
}

/** Remember the in-site page where the reader clicked on a manual post. */
document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  const next = new URL(link.href, location.href);
  if (next.origin !== location.origin || next.pathname !== "/bai-viet/") return;
  if (isSafeBackTarget(location.href)) {
    try { sessionStorage.setItem(RETURN_KEY, location.href); } catch {}
  }
});

function showArticleError(message: string) {
  byId("ak-live-loading")?.classList.add("hidden");
  byId("ak-live-content")?.classList.add("hidden");
  byId("ak-live-error")?.classList.remove("hidden");
  const info = byId("ak-live-error-text");
  if (info) info.textContent = message;
}

export async function mountManualArticle(force = false) {
  const article = byId("ak-live-article");
  if (!article) {
    controller?.abort();
    return;
  }
  const slug = new URL(location.href).searchParams.get("slug") || "";
  const requestKey = slug;
  if (!force && article.dataset.loadedSlug === requestKey) return;
  article.dataset.loadedSlug = requestKey;
  const localVersion = ++renderVersion;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  byId("ak-live-loading")?.classList.remove("hidden");
  byId("ak-live-error")?.classList.add("hidden");
  byId("ak-live-content")?.classList.add("hidden");

  const backLink = byId("ak-live-back") as HTMLAnchorElement | null;
  if (backLink) {
    let returnUrl = "/archive/";
    try {
      const candidate = sessionStorage.getItem(RETURN_KEY) || "";
      if (isSafeBackTarget(candidate)) returnUrl = candidate;
    } catch {}
    backLink.href = returnUrl;
  }

  if (!slug || slug.length > 120) {
    showArticleError("Đường dẫn bài viết không hợp lệ. Bạn có thể quay lại danh sách bài viết.");
    return;
  }
  try {
    const response = await fetch("/api/manual-posts/" + encodeURIComponent(slug), {
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) {
      showArticleError(response.status === 404 ?
        "Bài viết chưa được xuất bản, bị ẩn hoặc không tồn tại." :
        "Không thể kết nối đến máy chủ. Hãy thử tải lại.");
      return;
    }
    const result = await response.json();
    const post = result.post;
    if (!post) throw new Error("missing-post");
    if (signal.aborted || localVersion !== renderVersion || !article.isConnected ||
        new URL(location.href).searchParams.get("slug") !== slug) return;

    const title = byId("ak-live-title");
    if (title) {
      title.dataset.akVi = post.title || "Bài viết";
      title.dataset.akEn = post.title_en || post.title || "Article";
      title.textContent = document.documentElement.dataset.akLocale === "en" ?
        (title.dataset.akEn ?? "") : (title.dataset.akVi ?? "");
    }
    const excerpt = byId("ak-live-excerpt");
    if (excerpt) {
      excerpt.dataset.akVi = post.excerpt || "";
      excerpt.dataset.akEn = post.excerpt_en || post.excerpt || "";
      excerpt.textContent = document.documentElement.dataset.akLocale === "en" ?
        (excerpt.dataset.akEn ?? "") : (excerpt.dataset.akVi ?? "");
      excerpt.classList.toggle("hidden", !post.excerpt && !post.excerpt_en);
    }
    const meta = byId("ak-live-meta");
    if (meta) {
      const format = (s: string) => {
        const date = new Date(s);
        return Number.isNaN(date.valueOf()) ? "" :
          date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") +
          "-" + String(date.getUTCDate()).padStart(2, "0");
      };
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
      if (post.published_at) meta.append(metaPart(format(post.published_at), "▣"));
      const category = String(post.category || "").trim();
      meta.append(metaPart(category || "Chưa phân loại", "▤",
        category ? "/archive/?category=" + encodeURIComponent(category) : "/archive/?uncategorized=true"));
      const tags = Array.isArray(post.tags) ? post.tags : [];
      const tagsWrap = document.createElement("span");
      tagsWrap.className = "ak-article-meta-tags";
      const badge = document.createElement("span");
      badge.className = "ak-article-meta-symbol";
      badge.textContent = "#";
      tagsWrap.append(badge);
      if (tags.length) tags.forEach((tag: string, index: number) => {
        if (index) {
          const slash = document.createElement("span");
          slash.textContent = " / ";
          tagsWrap.append(slash);
        }
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
    const body = byId("ak-live-body");
    if (body) {
      const vi = document.createElement("div");
      vi.className = "ak-lang-vi";
      vi.innerHTML = markdown.render(post.body_markdown || "");
      const en = document.createElement("div");
      en.className = "ak-lang-en";
      en.innerHTML = markdown.render(post.body_markdown_en || post.body_markdown || "");
      body.replaceChildren(vi, en);
    }
    const tags = byId("ak-live-tags");
    if (tags) {
      tags.replaceChildren();
      for (const tag of Array.isArray(post.tags) ? post.tags : []) {
        const chip = document.createElement("span");
        chip.className = "px-3 py-1 rounded-full text-xs font-bold bg-[var(--btn-regular-bg)] text-[var(--text-75)]";
        chip.textContent = "#" + String(tag);
        tags.appendChild(chip);
      }
    }
    document.title = ((document.documentElement.dataset.akLocale === "en" ?
      post.title_en || post.title : post.title) || "Bài viết") + " - Anh Khôi AI Media";
    byId("ak-live-loading")?.classList.add("hidden");
    byId("ak-live-content")?.classList.remove("hidden");
  } catch (error) {
    if (signal.aborted || localVersion !== renderVersion) return;
    showArticleError("Không thể tải nội dung lúc này. Hãy kiểm tra kết nối và thử lại.");
  }
}

function boot() {
  void mountManualArticle();
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
