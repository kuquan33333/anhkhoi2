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


test("layout head contains real whitespace and valid canonical/social tags", () => {
  const layout = read("src/layouts/Layout.astro");
  assert.doesNotMatch(layout, /\\n\\t/);
  assert.match(layout, /rel="canonical"/);
  assert.match(layout, /name="twitter:image"/);
});

test("editorial navigation keeps correct English labels on desktop and mobile", () => {
  const navbar = read("src/components/Navbar.astro");
  const menu = read("src/components/widget/NavMenuPanel.astro");
  for (const [url, label] of [
    ["/chuyen-muc/cong-nghe-ai/", "Technology & AI"],
    ["/chuyen-muc/khoa-hoc-kham-pha/", "Science & Discovery"],
    ["/chuyen-muc/du-lich-trai-nghiem/", "Travel & Experiences"],
    ["/chuyen-muc/quan-su-cong-nghe-quoc-phong/", "Military & Defense Technology"],
  ]) {
    assert.ok(navbar.includes(url));
    assert.ok(navbar.includes(label));
    assert.ok(menu.includes(url));
    assert.ok(menu.includes(label));
  }
});
