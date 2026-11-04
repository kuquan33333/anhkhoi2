import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("sidebar taxonomy is intentionally small and reusable", () => {
  const api = read("functions/api/post-taxonomy.js");
  for (const category of [
    "AI & Công nghệ",
    "Apple & Thiết bị",
    "Video & Sáng tạo",
    "Hạ tầng & Phần cứng",
    "Robot & Tự động hóa",
  ]) assert.ok(api.includes(category));
  assert.match(api, /filter\(item => item\.count >= 2\)/);
  assert.match(api, /slice\(0, 8\)/);
});

test("admin accepts only curated categories and at most three unique tags", () => {
  for (const file of [
    "functions/api/admin/manual-posts.js",
    "functions/api/admin/manual-posts/[id].js",
  ]) {
    const api = read(file);
    assert.match(api, /CATEGORY_OPTIONS = new Set/);
    assert.match(api, /normalizeCategory/);
    assert.match(api, /normalizeTags/);
    assert.match(api, /\.slice\(0, 3\)/);
  }
  const admin = read("src/pages/admin.astro");
  assert.match(admin, /<select id="manualCategory">/);
  assert.match(admin, /Chủ đề \(tối đa 3/);
  assert.match(admin, /Sidebar chỉ hiện các chủ đề có ít nhất 2 bài và tối đa 8 chủ đề/);
});

test("taxonomy migration maps current editorial posts into five categories", () => {
  const migration = read("migrations/0008_curated_taxonomy.sql");
  const expected = [
    "AI & Công nghệ",
    "Apple & Thiết bị",
    "Video & Sáng tạo",
    "Hạ tầng & Phần cứng",
    "Robot & Tự động hóa",
  ];
  for (const category of expected) assert.ok(migration.includes(category));
  assert.equal((migration.match(/UPDATE manual_posts SET category=/g) || []).length, 14);
});
