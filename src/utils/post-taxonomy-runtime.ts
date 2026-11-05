import { categoryUrl } from "../constants/editorial-taxonomy";
type Facet = { name: string; count: number };
function renderTaxonomy(items: Facet[], container: HTMLElement, kind: "category" | "tag") {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "text-50 text-sm";
    empty.textContent = kind === "category" ? "Chưa có chuyên mục." : "Chưa có thẻ.";
    container.append(empty);
    return;
  }
  for (const item of items) {
    const a = document.createElement("a");
    a.href = kind === "category" ? categoryUrl(item.name) : "/archive/?tag=" + encodeURIComponent(item.name);
    a.className = kind === "category"
      ? "btn-plain flex w-full items-center !justify-between rounded-lg px-3 py-2 text-left text-75 font-medium hover:text-[var(--primary)]"
      : "inline-flex rounded-lg bg-[var(--btn-regular-bg)] px-3 py-2 text-[var(--btn-content)] font-medium hover:text-[var(--primary)]";
    const label = document.createElement("span");
    label.textContent = item.name;
    if (kind === "category") label.className = "flex-1 text-left";
    a.append(label);
    if (kind === "category") {
      const badge = document.createElement("span");
      badge.className = "text-xs rounded-md bg-[var(--btn-regular-bg)] px-2 py-1 text-[var(--btn-content)] font-bold";
      badge.textContent = String(item.count);
      a.append(badge);
    }
    container.append(a);
  }
}
let cachedTaxonomy: { categories: Facet[]; tags: Facet[] } | null = null;
let fetchedAt = 0;
let pending: Promise<void> | null = null;
async function loadTaxonomy() {
  const categories = document.querySelector<HTMLElement>("[data-ak-post-categories]");
  const tags = document.querySelector<HTMLElement>("[data-ak-post-tags]");
  if (!categories && !tags) return;
  if (cachedTaxonomy && Date.now() - fetchedAt < 30000) {
    if (categories) renderTaxonomy(cachedTaxonomy.categories, categories, "category");
    if (tags) renderTaxonomy(cachedTaxonomy.tags, tags, "tag");
    return;
  }
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch("/api/post-taxonomy", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("taxonomy-error");
      const result = await response.json();
      cachedTaxonomy = {
        categories: Array.isArray(result.categories) ? result.categories : [],
        tags: Array.isArray(result.tags) ? result.tags : []
      };
      fetchedAt = Date.now();
      const targetCategories = document.querySelector<HTMLElement>("[data-ak-post-categories]");
      const targetTags = document.querySelector<HTMLElement>("[data-ak-post-tags]");
      if (targetCategories) renderTaxonomy(cachedTaxonomy.categories, targetCategories, "category");
      if (targetTags) renderTaxonomy(cachedTaxonomy.tags, targetTags, "tag");
    } catch {
      for (const node of [categories, tags]) {
        if (node) node.textContent = "Không thể tải danh mục. Thử tải lại trang.";
      }
    } finally { pending = null; }
  })();
  return pending;
}
document.addEventListener("DOMContentLoaded", () => { void loadTaxonomy(); });
document.addEventListener("swup:page:view", () => { void loadTaxonomy(); });
document.addEventListener("astro:page-load", () => { void loadTaxonomy(); });
if (document.readyState !== "loading") void loadTaxonomy();
