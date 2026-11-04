import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fuwari light and dark keep upstream root/card/text theme behavior", () => {
  const variables = source("src/styles/variables.styl");
  const css = source("src/styles/main.css");
  const layout = source("src/layouts/Layout.astro");
  for (const token of ["--page-bg", "--card-bg", "--text-primary", "--text-75", "--text-50", "--text-30"]) {
    assert.ok(variables.includes(token + ":"), token + " must be defined");
  }
  assert.match(layout, /bg-\[var\(--page-bg\)\]/);
  assert.match(css, /\.card-base\s*\{\s*@apply[^}]*bg-\[var\(--card-bg\)\]/);
  assert.match(css, /\.text-75\s*\{\s*@apply text-black\/75 dark:text-white\/75/);
  assert.doesNotMatch(css, /html, body\s*\{\s*background-color/);
});

test("manual post detail has a top back link and readable Markdown", () => {
  const page = source("src/pages/bai-viet.astro");
  const script = source("src/utils/manual-article-runtime.ts");
  assert.ok(page.includes('id="ak-live-back"'));
  assert.ok(page.includes('id="ak-live-retry"'));
  assert.ok(page.includes("prose dark:prose-invert"));
  assert.ok(script.includes('document.addEventListener("swup:page:view"'));
  assert.ok(script.includes("controller?.abort()"));
  assert.ok(script.includes("article.isConnected"));
  assert.ok(!page.includes("const loading=document.getElementById"));
});

test("static Fuwari articles include back navigation", () => {
  assert.ok(source("src/pages/posts/[...slug].astro").includes('aria-label="Quay lại danh sách bài viết"'));
});

test("unified editorial cards preserve Fuwari cover-on-right layout", () => {
  const page = source("src/components/ManualPostsFeed.astro");
  const client = source("src/utils/manual-feed-runtime.ts");
  assert.ok(page.includes(".ak-editorial-card.has-cover .ak-editorial-main"));
  assert.ok(page.includes(".ak-editorial-cover{position:absolute;top:1rem;right:1rem;"));
  assert.ok(page.includes("@media(min-width:768px)"));
  assert.ok(client.includes('document.addEventListener("swup:page:view"'));
});

test("Facebook videos render the native player immediately for one-click playback", () => {
  const code = source("src/utils/facebook-feed-runtime.ts");
  const style = source("src/components/FacebookRuntimeFeed.astro");
  assert.ok(code.includes('"https://www.facebook.com/plugins/video.php"'));
  assert.ok(code.includes('embedUrl.searchParams.set("autoplay", "false")'));
  assert.ok(code.includes('shell.append(player)'));
  assert.ok(!code.includes('"ak-runtime-overlay-play"'));
  assert.ok(!code.includes("akPlayVideo"));
  assert.ok(!code.includes("akResetVideo"));
  assert.ok(!style.includes(".ak-runtime-overlay-play"));
  assert.ok(style.includes(".ak-runtime-video-iframe{position:absolute;inset:0"));
});

test("top bar is compact and mobile layout preserves the full banner", () => {
  const nav = source("src/components/Navbar.astro");
  const search = source("src/components/Search.svelte");
  const main = source("src/layouts/MainGridLayout.astro");
  const layout = source("src/layouts/Layout.astro");
  assert.ok(nav.includes("h-[3.75rem]"));
  assert.ok(nav.includes("hidden lg:flex"));
  assert.ok(nav.includes("lg:!hidden"));
  assert.ok(search.includes("w-10 h-10"));
  assert.ok(search.includes("top-16"));
  assert.ok(layout.includes("NAVBAR_HEIGHT = 60"));
  assert.ok(layout.includes("banner-height-home)_-_3.75rem"));
  assert.ok(main.includes("body.enable-banner #top-row"));
  assert.ok(main.includes("position: sticky !important"));
  assert.ok(main.includes("object-fit: contain !important"));
  assert.ok(main.includes("#main-content-shell"));
});

test("sidebar categories stay left aligned regardless of btn-plain defaults", () => {
  const runtime = source("src/utils/post-taxonomy-runtime.ts");
  const css = source("src/styles/main.css");
  assert.ok(runtime.includes("ak-taxonomy-category"));
  assert.ok(runtime.includes("!justify-between"));
  assert.ok(runtime.includes("text-left"));
  assert.match(css, /\.ak-taxonomy-category\{[^}]*justify-content:space-between!important;[^}]*text-align:left!important/);
  assert.match(css, /\.ak-taxonomy-category \.ak-taxonomy-label\{[^}]*text-align:left!important/);
});

test("mobile editorial covers keep their natural image ratio instead of cropping", () => {
  const feed = source("src/components/ManualPostsFeed.astro");
  assert.ok(feed.includes("@media(max-width:767px)"));
  assert.ok(feed.includes(".ak-editorial-cover{aspect-ratio:16/9;min-height:0"));
  assert.ok(feed.includes("object-fit:contain"));
});

