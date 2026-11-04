import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fuwari light and dark both define explicit text colors", () => {
  const variables = source("src/styles/variables.styl");
  const css = source("src/styles/main.css");
  for (const token of ["--page-bg", "--card-bg", "--text-primary", "--text-75", "--text-50", "--text-30"]) {
    assert.ok(variables.includes(token + ":"), token + " must be defined");
  }
  assert.match(css, /html, body\s*\{\s*background-color:var\(--page-bg\)/);
  assert.match(css, /\.card-base\s*\{[\s\S]*?color: var\(--text-primary\)/);
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

test("admin cards match desktop cover-on-right layout", () => {
  const page = source("src/components/ManualPostsFeed.astro");
  const client = source("src/utils/manual-feed-runtime.ts");
  assert.ok(page.includes(".ak-manual-card.has-cover .ak-manual-content"));
  assert.ok(page.includes(".ak-manual-cover{position:absolute;right:"));
  assert.ok(page.includes("@media(max-width:760px)"));
  assert.ok(client.includes('document.addEventListener("swup:page:view"'));
});

test("Facebook videos play inside the poster with center play button", () => {
  const code = source("src/utils/facebook-feed-runtime.ts");
  const style = source("src/components/FacebookRuntimeFeed.astro");
  assert.ok(code.includes('"ak-runtime-overlay-play"'));
  assert.ok(code.includes("shell.replaceChildren(player, close)"));
  assert.ok(code.includes('embedUrl.searchParams.set("autoplay", "true")'));
  assert.ok(code.includes("akResetVideo(activeVideo)"));
  assert.ok(!code.includes("card.append(region, player)"));
  assert.ok(style.includes(".ak-runtime-overlay-play{position:absolute;inset:0"));
  assert.ok(style.includes(".ak-runtime-video-iframe{position:absolute;inset:0"));
});
