import { categoryUrl, normalizeCategoryName } from "../constants/editorial-taxonomy";

type EditorialPost = {
  id: number; slug: string; title: string; title_en?: string;
  excerpt: string; excerpt_en?: string; language: string;
  category?: string | null; tags: string[]; cover_r2_key?: string | null;
  published_at: string | null; words?: number; minutes?: number;
};
type EditorialFeed = {
  key: string; page: number; fetching: boolean; pageSize: number; totalPages: number;
};

const editorialStates = new WeakMap<HTMLElement, EditorialFeed>();
const iconPaths: Record<string, string> = {
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z",
  hash: "M4 9h16 M4 15h16 M11 3 7 21 M17 3l-4 18"
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", value?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value !== undefined) node.textContent = value;
  return node;
}
function icon(type: string) {
  const wrap = el("span", "ak-editorial-icon");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPaths[type] || iconPaths.book);
  svg.append(path);
  wrap.append(svg);
  return wrap;
}
function postDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")].join("-");
}
function locale() {
  return document.documentElement.dataset.akLocale === "en" ? "en" : "vi";
}
function bilingual(node: HTMLElement, vi: string, en: string) {
  node.dataset.akVi = vi;
  node.dataset.akEn = en || vi;
  node.textContent = locale() === "en" ? (en || vi) : vi;
}
function buildMeta(post: EditorialPost) {
  const meta = el("div", "ak-editorial-meta");
  const date = postDate(post.published_at);
  if (date) {
    const part = el("span", "ak-editorial-meta-part");
    part.append(icon("calendar"), el("span", "", date));
    meta.append(part);
  }
  const cat = el("a", "ak-editorial-meta-part");
  const category = (post.category || "").trim();
  cat.href = category ? categoryUrl(category) : "/archive/?uncategorized=true";
  cat.append(icon("book"), el("span", "", category || "Chưa phân loại"));
  meta.append(cat);

  const group = el("span", "ak-editorial-meta-part");
  group.append(icon("hash"));
  const tags = el("span", "ak-editorial-tags");
  if (!post.tags?.length) tags.append(el("span", "", "Chưa có tag"));
  else post.tags.forEach((tag, index) => {
    if (index) tags.append(el("span", "ak-editorial-divider", "/"));
    const link = el("a", "", String(tag));
    link.href = "/archive/?tag=" + encodeURIComponent(String(tag));
    tags.append(link);
  });
  group.append(tags);
  meta.append(group);
  return meta;
}
function makeCard(post: EditorialPost) {
  const href = "/bai-viet/?slug=" + encodeURIComponent(post.slug);
  const card = el("article", "ak-editorial-card card-base onload-animation");
  const validCover = typeof post.cover_r2_key === "string" &&
    /^admin\/[A-Za-z0-9/_\-.]+$/.test(post.cover_r2_key);
  if (validCover) card.classList.add("has-cover");

  const main = el("div", "ak-editorial-main");
  const title = el("h2", "ak-editorial-title");
  const link = el("a");
  link.href = href;
  bilingual(link, post.title, post.title_en || "");
  title.append(link);
  main.append(title, buildMeta(post));

  if (post.excerpt) {
    const excerpt = el("p", "ak-editorial-excerpt");
    bilingual(excerpt, post.excerpt, post.excerpt_en || "");
    main.append(excerpt);
  }
  const count = el("div", "ak-editorial-read-time");
  const words = Number(post.words || 0), minutes = Number(post.minutes || 1);
  count.append(el("span", "", words + " từ"), el("span", "", "·"),
    el("span", "", minutes + " phút đọc"));
  main.append(count);
  card.append(main);

  if (validCover) {
    const photo = el("a", "ak-editorial-cover");
    photo.href = href;
    photo.setAttribute("aria-label", "Xem bài: " + post.title);
    const img = el("img");
    img.src = "/api/media?key=" + encodeURIComponent(post.cover_r2_key || "");
    img.alt = post.title;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => photo.classList.add("hidden"));
    photo.append(img);
    card.append(photo);
  } else {
    const arrow = el("a", "ak-editorial-chevron", "›");
    arrow.href = href;
    arrow.setAttribute("aria-label", "Xem bài: " + post.title);
    card.append(arrow);
  }
  return card;
}
function queryFor(section: HTMLElement) {
  const mode = section.dataset.mode;
  const source = new URL(location.href);
  const u = new URLSearchParams();
  const fixedCategory = String(section.dataset.category || "").trim();
  if (fixedCategory) u.set("category", fixedCategory);
  else if (mode === "archive") {
    for (const k of ["category", "tag", "uncategorized"]) {
      const v = source.searchParams.get(k);
      if (!v) continue;
      u.set(k, k === "category" ? normalizeCategoryName(v) : v);
    }
  }
  return u.toString();
}
function setFilterLabel(section: HTMLElement) {
  const label = section.querySelector<HTMLElement>("[data-manual-filter]");
  if (!label) return;
  const u = new URL(location.href);
  const tag = u.searchParams.get("tag");
  const cat = u.searchParams.get("category");
  const normalizedCat = cat ? normalizeCategoryName(cat) : "";
  label.textContent = tag ? "Bài viết theo tag: #" + tag :
    normalizedCat ? "Bài viết trong chuyên mục: " + normalizedCat :
    u.searchParams.has("uncategorized") ? "Bài viết chưa phân loại" :
    "Tất cả bài viết, sắp xếp theo ngày mới nhất.";
}
function requestedPage(section: HTMLElement): number {
  if (section.dataset.mode === "home") return 1;
  const raw = Number.parseInt(new URL(location.href).searchParams.get("page") || "1", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
}
function pageHref(page: number): string {
  const u = new URL(location.href);
  if (page <= 1) u.searchParams.delete("page");
  else u.searchParams.set("page", String(page));
  return u.pathname + (u.searchParams.size ? "?" + u.searchParams.toString() : "");
}
function pageWindow(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 4) [2, 3, 4, 5].forEach(p => pages.add(p));
  if (current >= total - 3) [total - 4, total - 3, total - 2, total - 1].forEach(p => pages.add(p));
  const ordered = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  ordered.forEach((p, i) => {
    if (i && p - ordered[i - 1] > 1) out.push("ellipsis");
    out.push(p);
  });
  return out;
}
function renderPagination(section: HTMLElement, current: number, total: number) {
  const nav = section.querySelector<HTMLElement>("[data-manual-pagination]");
  const pages = section.querySelector<HTMLElement>("[data-manual-pages]");
  const prev = section.querySelector<HTMLAnchorElement>("[data-manual-prev]");
  const next = section.querySelector<HTMLAnchorElement>("[data-manual-next]");
  if (!nav || !pages || !prev || !next) return;
  if (section.dataset.mode === "home" || total <= 1) {
    nav.hidden = true;
    pages.replaceChildren();
    return;
  }
  nav.hidden = false;
  pages.replaceChildren();
  for (const item of pageWindow(current, total)) {
    if (item === "ellipsis") {
      pages.append(el("span", "ak-page-ellipsis", "…"));
      continue;
    }
    const link = el("a", "ak-page-link", String(item));
    link.href = pageHref(item);
    link.setAttribute("data-no-swup", "");
    link.setAttribute("aria-label", "Trang " + item);
    if (item === current) {
      link.classList.add("is-current");
      link.setAttribute("aria-current", "page");
    }
    pages.append(link);
  }
  prev.href = current > 1 ? pageHref(current - 1) : "#";
  next.href = current < total ? pageHref(current + 1) : "#";
  prev.setAttribute("data-no-swup", "");
  next.setAttribute("data-no-swup", "");
  prev.classList.toggle("is-disabled", current <= 1);
  next.classList.toggle("is-disabled", current >= total);
  prev.setAttribute("aria-disabled", String(current <= 1));
  next.setAttribute("aria-disabled", String(current >= total));
}
async function loadPosts(section: HTMLElement, state: EditorialFeed) {
  if (state.fetching || !section.isConnected) return;
  state.fetching = true;
  const nav = section.querySelector<HTMLElement>("[data-manual-pagination]");
  const notice = section.querySelector<HTMLElement>("[data-manual-status]");
  const grid = section.querySelector<HTMLElement>("[data-manual-grid]");
  try {
    const params = new URLSearchParams(queryFor(section));
    params.set("limit", String(state.pageSize));
    params.set("offset", String((state.page - 1) * state.pageSize));
    const response = await fetch("/api/manual-posts?" + params.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("post_feed_request_failed");
    const data = await response.json();
    const currentKey = queryFor(section) + "|page=" + state.page + "|size=" + state.pageSize;
    if (!section.isConnected || state.key !== currentKey) return;

    const posts: EditorialPost[] = Array.isArray(data.posts) ? data.posts : [];
    state.totalPages = Math.max(0, Number(data.pageCount || 0));
    if (!data.enabled) {
      grid?.replaceChildren();
      if (notice) {
        notice.textContent = "Danh sách bài viết hiện đang được ẩn trong quản trị.";
        notice.classList.remove("hidden");
      }
      if (nav) nav.hidden = true;
    } else if (!posts.length) {
      grid?.replaceChildren();
      if (notice) {
        notice.textContent = state.page > 1
          ? "Trang này không còn bài viết. Hãy chọn trang trước."
          : "Chưa có bài viết phù hợp trong mục này.";
        notice.classList.remove("hidden");
      }
      renderPagination(section, state.page, state.totalPages);
    } else {
      grid?.replaceChildren(...posts.map(makeCard));
      notice?.classList.add("hidden");
      renderPagination(section, state.page, state.totalPages);
    }
  } catch {
    if (notice) {
      notice.textContent = "Không thể tải danh sách bài viết. Hãy thử lại.";
      notice.classList.remove("hidden");
    }
    if (nav) nav.hidden = true;
  } finally {
    state.fetching = false;
  }
}
function bootPosts() {
  document.querySelectorAll<HTMLElement>("[data-ak-manual-feed]").forEach(section => {
    const page = requestedPage(section);
    const rawSize = Number.parseInt(section.dataset.pageSize || "", 10);
    const pageSize = Number.isInteger(rawSize) && rawSize > 0 ? Math.min(12, rawSize) : 6;
    const key = queryFor(section) + "|page=" + page + "|size=" + pageSize;
    const oldState = editorialStates.get(section);
    if (oldState && oldState.key === key) return;

    section.querySelector("[data-manual-grid]")?.replaceChildren();
    section.querySelector("[data-manual-status]")?.classList.add("hidden");
    setFilterLabel(section);
    const state = { key, page, fetching:false, pageSize, totalPages:0 };
    editorialStates.set(section, state);
    void loadPosts(section, state);
  });
}
document.addEventListener("DOMContentLoaded", bootPosts);
document.addEventListener("swup:page:view", bootPosts);
document.addEventListener("astro:page-load", bootPosts);
document.addEventListener("popstate", bootPosts);
if (document.readyState !== "loading") bootPosts();
