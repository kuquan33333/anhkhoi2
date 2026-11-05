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

test("homepage is curated while archive stays on the unified D1 feed", () => {
  const home = read("src/pages/[...page].astro");
  const archive = read("src/pages/archive.astro");
  assert.match(home, /sectionTitle="Bài mới"/);
  assert.match(home, /category="Công nghệ & AI"/);
  assert.match(home, /category="Khoa học & Khám phá"/);
  assert.match(home, /category="Du lịch & Trải nghiệm"/);
  assert.match(home, /category="Quân sự & Công nghệ quốc phòng"/);
  assert.match(archive, /<ManualPostsFeed mode="archive"/);
  assert.doesNotMatch(home, /<PostPage/);
});

test("three historical example posts remain preserved as editable drafts", () => {
  const seed = read("migrations/0007_seed_examples_draft.sql");
  const schema = read("migrations/0006_unified_editorial_posts.sql");
  for (const slug of sampleSlugs) {
    assert.ok(seed.includes(slug));
    assert.match(read("src/content/posts/" + slug + ".md"), /draft:\s*true/);
  }
  for (const col of ["title_en","excerpt_en","body_markdown_en","legacy_slug"])
    assert.ok(schema.includes("ADD COLUMN " + col));
});

test("article cards use category pages, tags and stable article URLs", () => {
  const client = read("src/utils/manual-feed-runtime.ts");
  assert.ok(client.includes('icon("calendar")'));
  assert.ok(client.includes('icon("book")'));
  assert.ok(client.includes('icon("hash")'));
  assert.ok(client.includes('categoryUrl(category)'));
  assert.ok(client.includes('"/archive/?tag="'));
  assert.ok(client.includes('"/bai-viet/?slug="'));
});

test("admin edits, hides and safely archives instead of physical deletion", () => {
  const ui = read("src/pages/admin.astro");
  const api = read("functions/api/admin/manual-posts/[id].js");
  for (const action of ["data-edit-post", "data-toggle-post", "data-remove-post"])
    assert.ok(ui.includes(action));
  for (const method of ["onRequestGet", "onRequestPatch", "onRequestDelete"])
    assert.ok(api.includes(method));
  assert.match(api, /UPDATE manual_posts SET status='archived'/);
  assert.doesNotMatch(api, /DELETE FROM manual_posts/);
  assert.ok(ui.includes('id="manualPublishedAt"'));
  assert.ok(ui.includes('id="manualSources"'));
});

test("public API lists only publishable items with tags and stable pagination", async () => {
  const seen = [];
  const sample = { id:1,slug:"sample",title:"Sample",title_en:"Sample EN",
    excerpt:"",excerpt_en:"",language:"vi",category:"Công nghệ & AI",
    tags_json:'["AI"]',cover_r2_key:null,published_at:"2026-11-01T00:00:00.000Z",
    updated_at:"2026-11-01",content_length:100 };
  const env = { DB:{ prepare(sql) {
    seen.push(sql);
    return { bind(...params) {
      seen.push(params);
      return {
        async all(){return {results:[sample]};},
        async first(){return sql.includes("COUNT(*) AS total") ? {total:1} : null;}
      };
    }, async first(){return {value:"true"};} };
  } } };
  const response = await listPosts({request:new Request("https://example.com/api/manual-posts?limit=8"),env});
  const data = await response.json();
  assert.equal(data.enabled,true);
  assert.equal(data.posts[0].slug,"sample");
  assert.deepEqual(data.posts[0].tags,["AI"]);
  assert.equal(data.total,1);
  assert.equal(data.pageCount,1);
  assert.ok(seen.some(x => typeof x === "string" && x.includes("status='published'")));
  assert.ok(seen.some(x => typeof x === "string" && x.includes("REMOVE_DUPLICATE")));
});

test("sidebar taxonomy comes from current D1 posts", async () => {
  const env = { DB:{ prepare(){return {
    async first(){return {value:"true"};},
    async all(){return {results:[
      {category:"Công nghệ & AI",tags_json:'["AI","Video AI"]'},
      {category:"Công nghệ & AI",tags_json:'["AI"]'}
    ]};}
  };} } };
  const response=await listTaxonomy({env});
  const data=await response.json();
  assert.equal(data.categories[0].count,2);
  assert.equal(data.tags.find(x=>x.name==="AI").count,2);
});
