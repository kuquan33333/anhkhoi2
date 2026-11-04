import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("runtime article list uses numbered pagination instead of load-more", () => {
  const feed = read("src/components/ManualPostsFeed.astro");
  const runtime = read("src/utils/manual-feed-runtime.ts");
  const api = read("functions/api/manual-posts.js");
  assert.doesNotMatch(feed, /Xem thêm bài viết|data-manual-more/);
  assert.match(feed, /data-manual-pages/);
  assert.match(runtime, /pageWindow\(current: number, total: number\)/);
  assert.match(runtime, /pageSize: 6/);
  assert.match(runtime, /params\.set\("offset", String\(\(state\.page - 1\) \* state\.pageSize\)\)/);
  assert.match(runtime, /setAttribute\("aria-current", "page"\)/);
  assert.match(api, /SELECT COUNT\(\*\) AS total FROM manual_posts/);
  assert.match(api, /pageCount/);
});

test("category rows are always full-width and left aligned", () => {
  const runtime = read("src/utils/post-taxonomy-runtime.ts");
  const categories = read("src/components/widget/Categories.astro");
  assert.match(runtime, /w-full items-center !justify-between/);
  assert.match(runtime, /label\.className = "flex-1 text-left"/);
  assert.match(categories, /items-stretch gap-1 text-left/);
});

test("top bar is compact and tablet uses the menu instead of crowded links", () => {
  const nav = read("src/components/Navbar.astro");
  const search = read("src/components/Search.svelte");
  assert.match(nav, /h-\[3\.5rem\] md:h-\[3\.75rem\]/);
  assert.match(nav, /hidden xl:flex items-center/);
  assert.match(nav, /xl:!hidden/);
  assert.match(nav, /h-10 w-10/);
  assert.match(search, /h-10 mr-1/);
  assert.match(search, /w-32 active:w-44 focus:w-44/);
});

test("mobile banner and article covers preserve their full composition", () => {
  const layout = read("src/layouts/Layout.astro");
  const feed = read("src/components/ManualPostsFeed.astro");
  const grid = read("src/layouts/MainGridLayout.astro");
  assert.match(layout, /@media \(max-width: 767px\)/);
  assert.match(layout, /height: 9rem !important/);
  assert.match(layout, /object-fit: contain !important/);
  assert.match(layout, /#main-panel/);
  assert.match(feed, /object-fit:contain;background:var\(--btn-regular-bg\)/);
  assert.match(feed, /@media\(min-width:768px\)[\s\S]*object-fit:cover/);
  assert.match(grid, /px-2 sm:px-3 md:px-4/);
});
