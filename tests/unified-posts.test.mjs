import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequestGet as listPosts } from "../functions/api/manual-posts.js";
import { onRequestGet as listTaxonomy } from "../functions/api/post-taxonomy.js";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sampleSlugs = [
  "chao-mung-anh-khoi-ai-media",
  "video-ai-ke-chuyen",
  "tin-cong-nghe-va-kiem-chung"
];

test("homepage and archive use the exact same D1 feed without the old separate heading", () => {
  const home = read("src/pages/[...page].astro");
  const archive = read("src/pages/archive.astro");
  const component = read("src/components/ManualPostsFeed.astro");
  assert.match(home, /<ManualPostsFeed mode="home"/);
  assert.doesNotMatch(home, /<PostPage/);
  assert.match(archive, /<ManualPostsFeed mode="archive"/);
  assert.doesNotMatch(archive, /<ArchivePanel/);
  assert.ok(!component.includes("Bài viết mới của Anh Khôi"));
  assert.ok(!component.includes("ANH KHÔI · BÀI VIẾT"));
});

test("three historical example posts are preserved as editable drafts in migration", () => {
  const seed = read("migrations/0007_seed_examples_draft.sql");
  const schema = read("migrations/0006_unified_editorial_posts.sql");
  for (const slug of sampleSlugs) {
    assert.ok(seed.includes(slug));
    assert.match(read("src/content/posts/" + slug + ".md"), /draft:\s*true/);
  }
  for (const col of ["title_en","excerpt_en","body_markdown_en","legacy_slug"])
    assert.ok(schema.includes("ADD COLUMN " + col));
});

test("Fuwari metadata uses consistent calendar, category and tag navigation", () => {
  const client = read("src/utils/manual-feed-runtime.ts");
  assert.ok(client.includes('icon("calendar")'));
  assert.ok(client.includes('icon("book")'));
  assert.ok(client.includes('icon("hash")'));
  assert.ok(client.includes('"/archive/?tag="'));
  assert.ok(client.includes('"/archive/?category="'));
  assert.ok(client.includes('"/bai-viet/?slug="'));
});

test("all migrated posts can be edited, hidden and deleted in Admin", () => {
  const ui = read("src/pages/admin.astro");
  const api = read("functions/api/admin/manual-posts/[id].js");
  for (const action of ["data-edit-post", "data-toggle-post", "data-remove-post"])
    assert.ok(ui.includes(action));
  for (const method of ["onRequestGet", "onRequestPatch", "onRequestDelete"])
    assert.ok(api.includes(method));
  assert.ok(api.includes("current.cover_r2_key"));
  assert.ok(api.includes("current.category"));
  assert.ok(ui.includes('id="manualPublishedAt"'));
});

test("public API lists only published items with tags and stable pagination", async () => {
  const seen = [];
  const sample = { id: 1, slug: "sample", title: "Sample", title_en: "Sample EN",
    excerpt: "", excerpt_en: "", language: "vi", category: "Công nghệ",
    tags_json:'["AI"]', cover_r2_key:null, published_at:"2026-11-01T00:00:00.000Z",
    updated_at:"2026-11-01", content_length:100 };
  const env = { DB: { prepare(sql) {
    seen.push(sql);
    return { bind(...params) {
      seen.push(params);
      return {
        async all() { return { results:[sample] }; },
        async first() { return sql.includes("COUNT(*) AS total") ? { total: 1 } : null; }
      };
    }, async first() {return {value:"true"};} };
  } } };
  const response = await listPosts({ request: new Request("https://example.com/api/manual-posts?limit=8"), env });
  const data = await response.json();
  assert.equal(data.enabled,true);
  assert.equal(data.posts[0].slug,"sample");
  assert.deepEqual(data.posts[0].tags,["AI"]);
  assert.equal(data.nextOffset,1);
  assert.equal(data.hasMore,false);
  assert.equal(data.total,1);
  assert.equal(data.pageCount,1);
  assert.ok(seen.some(x => typeof x === "string" && x.includes("status='published'")));
});

test("sidebar reads current taxonomy from D1 instead of stale static markdown", async () => {
  const env = { DB: { prepare() { return {
    async first(){ return {value:"true"}; },
    async all(){ return {results:[
      {category:"Công nghệ",tags_json:'["AI","Video AI"]'},
      {category:"Công nghệ",tags_json:'["AI"]'}
    ]}; }
  }; } } };
  const response = await listTaxonomy({env});
  const data = await response.json();
  assert.equal(data.categories[0].count,2);
  assert.equal(data.tags.find(x=>x.name==="AI").count,2);
});
