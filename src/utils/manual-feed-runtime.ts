function akManualText(tag: string, cls: string, text: string) {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}
function akManualPostDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? "" : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(d);
}
function akManualPostCard(post: any): HTMLElement {
  const href = "/bai-viet/?slug=" + encodeURIComponent(post.slug || "");
  const card = document.createElement("article");
  card.className = "ak-manual-card card-base";
  if (post.cover_r2_key) card.classList.add("has-cover");
  const content = document.createElement("div");
  content.className = "ak-manual-content";
  const title = akManualText("h3", "ak-manual-title", "");
  const titleLink = akManualText("a", "", String(post.title || "Bài viết"));
  titleLink.setAttribute("href", href);
  title.appendChild(titleLink);
  const meta = document.createElement("div");
  meta.className = "ak-manual-meta";
  for (const label of [String(post.category || "Bài viết"), akManualPostDate(post.published_at)].filter(Boolean)) {
    meta.appendChild(akManualText("span", "ak-manual-pill", label));
  }
  content.append(title, meta);
  if (post.excerpt) {
    content.appendChild(akManualText("p", "ak-manual-excerpt", String(post.excerpt)));
  }
  const read = akManualText("a", "ak-manual-link", "Đọc bài viết →");
  read.setAttribute("href", href);
  read.dataset.akVi = "Đọc bài viết →";
  read.dataset.akEn = "Read post →";
  content.appendChild(read);
  card.appendChild(content);
  if (typeof post.cover_r2_key === "string" &&
      /^admin\/[A-Za-z0-9/_\-.]+$/.test(post.cover_r2_key)) {
    const cover = document.createElement("a");
    cover.className = "ak-manual-cover";
    cover.href = href;
    cover.setAttribute("aria-label", "Đọc bài: " + (post.title || ""));
    const img = document.createElement("img");
    img.src = "/api/media?key=" + encodeURIComponent(post.cover_r2_key);
    img.alt = post.title || "Ảnh bìa bài viết";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => { cover.classList.add("hidden"); });
    cover.appendChild(img);
    card.appendChild(cover);
  }
  return card;
}
async function akRefreshManualFeed(section: HTMLElement) {
  const now = Date.now();
  if (section.dataset.loading === "1" || now - Number(section.dataset.checkedAt || 0) < 4000) return;
  section.dataset.loading = "1";
  section.dataset.checkedAt = String(now);
  try {
    const response = await fetch("/api/manual-posts", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("manual-feed-request");
    const payload = await response.json();
    if (!section.isConnected) return;
    const posts = Array.isArray(payload.posts) ? payload.posts : [];
    const grid = section.querySelector("[data-manual-grid]");
    if (!grid) return;
    if (!payload.enabled || posts.length === 0) {
      grid.replaceChildren();
      section.classList.add("hidden");
      return;
    }
    const limit = section.dataset.mode === "archive" ? 100 : 6;
    grid.replaceChildren(...posts.slice(0, limit).map(akManualPostCard));
    section.classList.remove("hidden");
  } catch {
    // Keep existing cards if the network fails; static blog content is unaffected.
  } finally { section.dataset.loading = "0"; }
}
function akBootManualPosts() {
  document.querySelectorAll<HTMLElement>("[data-ak-manual-feed]").forEach(section => {
    void akRefreshManualFeed(section);
  });
}
document.addEventListener("DOMContentLoaded", akBootManualPosts);
document.addEventListener("swup:page:view", akBootManualPosts);
document.addEventListener("astro:page-load", akBootManualPosts);
if (document.readyState !== "loading") akBootManualPosts();
