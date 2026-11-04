import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const worker = read("workers/facebook-sync/worker.js");
const start = worker.indexOf("function htmlDecode(value) {");
const end = worker.indexOf("function unescapeFacebookHtml", start);
assert.ok(start >= 0 && end > start);
const htmlDecode = new Function(worker.slice(start, end) + "return htmlDecode;")();

const frontend = read("src/utils/facebook-feed-runtime.ts");
const frontStart = frontend.indexOf("function akDecodeFacebookCaption(");
const frontEnd = frontend.indexOf("function akCreate", frontStart);
assert.ok(frontStart >= 0 && frontEnd > frontStart);
const transpiled = ts.transpileModule(frontend.slice(frontStart, frontEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const decodeForPage = new Function(transpiled + "return akDecodeFacebookCaption;")();

test("Facebook caption hex and decimal numeric entities display in Vietnamese", () => {
  const samples = [
    ["Bi&#x1ebf;n c&#x103;ng &#x111;&#xe9;t &#x1f633;", "Biến căng đét 😳"],
    ["C&#x103;ng &#x111;&#xe9;t , to&#xe0;n c&#x1ea3;nh", "Căng đét , toàn cảnh"],
    ["&amp;#x1ebf; &amp;amp;#x111; &#128640;", "ế đ 🚀"],
    ["Tin &#x2014; M&#x1edb;i", "Tin — Mới"],
    ["#xuhuong #tinnong", "#xuhuong #tinnong"]
  ];
  for (const [before, expected] of samples) {
    assert.equal(htmlDecode(before), expected, "Worker: " + before);
    assert.equal(decodeForPage(before), expected, "Website: " + before);
  }
});

test("Caption decoder never inserts untrusted HTML", () => {
  assert.match(frontend, /textContent = text/);
  assert.match(frontend, /akDecodeFacebookCaption\(item\.caption\)/);
  assert.equal(decodeForPage("&lt;script&gt;alert(1)&lt;/script&gt;"), "<script>alert(1)</script>");
});

test("The public Fuwari theme is not overridden by Admin's dark background", () => {
  const variables = read("src/styles/variables.styl");
  const css = read("src/styles/main.css");
  const admin = read("src/pages/admin.astro");
  assert.match(variables, /--page-bg:\s*oklch\(0\.95/);
  assert.doesNotMatch(css, /background-color:\s*var\(--page-bg\)\s*!important/);
  assert.doesNotMatch(css, /html:not\(\.dark\)/);
  assert.match(admin, /<style is:inline>/);
  assert.match(admin, /body\.ak-admin-page\{[^}]*radial-gradient/);
});

test("The article Back button uses a plain GET form to archive", () => {
  const page = read("src/pages/bai-viet.astro");
  const runtime = read("src/utils/manual-article-runtime.ts");
  assert.match(page, /<form action="\/archive\/" method="get" class="inline">\s*<button type="submit" id="ak-live-back"/);
  assert.match(page, /<button type="submit" class="ak-article-back[^>]*>← Xem các bài viết khác<\/button>/);
  assert.doesNotMatch(runtime, /RETURN_KEY|sessionStorage|isSafeBackTarget|window\.location\.assign/);
  assert.doesNotMatch(page, /data-no-swup id="ak-live-back"/);
});
