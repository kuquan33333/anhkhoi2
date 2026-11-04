type EditorialPost = {
  id: number; slug: string; title: string; title_en?: string;
  excerpt: string; excerpt_en?: string; language: string;
  category?: string | null; tags: string[]; cover_r2_key?: string | null;
  published_at: string | null; words?: number; minutes?: number;
};
type EditorialFeed = {
  key: string; page: number; fetching: boolean; totalPages: number; pageSize: number;
};
const editorialStates = new WeakMap<HTMLElement, EditorialFeed>();
const iconPaths: Record<string, string> = {
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
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
  cat.href = category ? "/archive/?category=" + encodeURIComponent(category) : "/archive/?uncategorized=true";
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
  count.append(el("span", "", words + " từ"), el("span", "", "|"),
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
    img.addEventListener("error", () => { photo.classList.add("hidden"); });
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
  if (mode === "archive") {
    for (const k of ["category", "tag", "uncategorized"]) {
      const v = source.searchParams.get(k);
      if (v) u.set(k, v);
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
  label.textContent = tag ? "Bài viết theo tag: #" + tag :
    cat ? "Bài viết trong chuyên mục: " + cat :
    u.searchParams.has("uncategorized") ? "Bài viết chưa phân loại" :
    "Tất cả bài viết, sắp xếp theo ngày mới nhất.";
}
function requestedPage(): number {
  const raw = Number.parseInt(new URL(location.href).searchParams.get("page") || "1", 10);
  return Number.isInteger(raw) && raw > 0 ? Math.min(raw, 999) : 1;
}
function pageHref(page: number): string {
  const u = new URL(location.href);
  if (page <= 1) u.searchParams.delete("page");
  else u.searchParams.set("page", String(page));
  return u.pathname + (u.searchParams.size ? "?" + u.searchParams.toString() : "") + u.hash;
}
function pageWindow(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}
function renderPagination(section: HTMLElement, state: EditorialFeed) {
  const nav = section.querySelector<HTMLElement>("[data-manual-pagination]");
  if (!nav) return;
  nav.replaceChildren();
  if (state.totalPages <= 1) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;
  const link = (label: string, page: number, cls = "") => {
    const a = el("a", "ak-page-link " + cls, label);
    a.href = pageHref(page);
    a.setAttribute("aria-label", page === state.page ? "Trang " + page + ", trang hiện tại" : "Đi tới trang " + page);
    if (page === state.page) {
      a.classList.add("is-current");
      a.setAttribute("aria-current", "page");
    }
    return a;
  };
  if (state.page > 1) {
    const prev = link("‹", state.page - 1, "is-arrow");
    prev.setAttribute("aria-label", "Trang trước");
    nav.append(prev);
  }
  for (const item of pageWindow(state.page, state.totalPages)) {
    if (item === "ellipsis") nav.append(el("span", "ak-page-ellipsis", "…"));
    else nav.append(link(String(item), item));
  }
  if (state.page < state.totalPages) {
    const next = link("›", state.page + 1, "is-arrow");
    next.setAttribute("aria-label", "Trang sau");
    nav.append(next);
  }
}
async function loadPosts(section: HTMLElement, state: EditorialFeed) {
  if (state.fetching || !section.isConnected) return;
  state.fetching = true;
  const nav = section.querySelector<HTMLElement>("[data-manual-pagination]");
  const notice = section.querySelector<HTMLElement>("[data-manual-status]");
  const grid = section.querySelector<HTMLElement>("[data-manual-grid]");
  if (nav) nav.hidden = true;
  try {
    const params = new URLSearchParams(state.key);
    params.set("limit", String(state.pageSize));
    params.set("offset", String((state.page - 1) * state.pageSize));
    const response = await fetch("/api/manual-posts?" + params.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("post_feed_request_failed");
    const data = await response.json();
    if (!section.isConnected || state.key !== queryFor(section)) return;
    const posts: EditorialPost[] = Array.isArray(data.posts) ? data.posts : [];
    const total = Math.max(0, Number(data.total || 0));
    state.totalPages = total > 0 ? Math.ceil(total / state.pageSize) : 0;

    if (state.totalPages && state.page > state.totalPages) {
      state.page = state.totalPages;
      history.replaceState(history.state, "", pageHref(state.page));
      state.fetching = false;
      return void loadPosts(section, state);
    }

    grid?.replaceChildren(...posts.map(makeCard));
    if (!data.enabled) {
      if (notice) {
        notice.textContent = "Danh sách bài viết hiện đang được ẩn trong quản trị.";
        notice.classList.remove("hidden");
      }
      state.totalPages = 0;
    } else if (posts.length === 0) {
      if (notice) {
        notice.textContent = "Chưa có bài viết nào trong danh sách này.";
        notice.classList.remove("hidden");
      }
    } else {
      notice?.classList.add("hidden");
    }
    renderPagination(section, state);
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
    const key = queryFor(section);
    const page = requestedPage();
    const previous = editorialStates.get(section);
    if (previous && previous.key === key && previous.page === page) return;
    section.querySelector("[data-manual-grid]")?.replaceChildren();
    section.querySelector("[data-manual-status]")?.classList.add("hidden");
    setFilterLabel(section);
    const state: EditorialFeed = {
      key,
      page,
      fetching: false,
      totalPages: 0,
      pageSize: 6
    };
    editorialStates.set(section, state);
    void loadPosts(section, state);
  });
}
document.addEventListener("DOMContentLoaded", bootPosts);
document.addEventListener("swup:page:view", bootPosts);
document.addEventListener("astro:page-load", bootPosts);
document.addEventListener("popstate", bootPosts);
if (document.readyState !== "loading") bootPosts();
