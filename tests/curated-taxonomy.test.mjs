import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const categories = [
  "Thời sự & Xã hội",
  "Thế giới",
  "Sức khỏe & Y tế",
  "Khoa học & Thiên văn",
  "Công nghệ & AI",
  "Kinh tế & Kinh doanh",
  "Đời sống & Tạp chí",
  "Văn hóa & Giải trí",
  "Thể thao",
];

test("editorial taxonomy supports broad coverage without sidebar sprawl", () => {
  const api = read("functions/api/post-taxonomy.js");
  for (const category of categories) assert.ok(api.includes(category));
  assert.match(api, /filter\(item => item\.count >= 2\)/);
  assert.match(api, /slice\(0, 10\)/);
});

test("admin exposes broad fixed categories and at most three unique topics", () => {
  for (const file of [
    "functions/api/admin/manual-posts.js",
    "functions/api/admin/manual-posts/[id].js",
  ]) {
    const api = read(file);
    for (const category of categories) assert.ok(api.includes(category));
    assert.match(api, /normalizeCategory/);
    assert.match(api, /normalizeTags/);
    assert.match(api, /\.slice\(0, 3\)/);
  }
  const admin = read("src/pages/admin.astro");
  assert.match(admin, /<select id="manualCategory">/);
  assert.match(admin, /Sức khỏe &amp; Y tế|Sức khỏe & Y tế/);
  assert.match(admin, /Khoa học &amp; Thiên văn|Khoa học & Thiên văn/);
  assert.match(admin, /Đời sống &amp; Tạp chí|Đời sống & Tạp chí/);
  assert.match(admin, /Chủ đề \(tối đa 3/);
  assert.match(admin, /tối đa 10 chủ đề/);
});

test("current posts are remapped out of the old narrow five-category taxonomy", () => {
  const migration = read("migrations/0009_broad_editorial_taxonomy.sql");
  for (const category of [
    "Công nghệ & AI",
    "Kinh tế & Kinh doanh",
    "Khoa học & Thiên văn",
    "Văn hóa & Giải trí",
    "Thế giới",
    "Đời sống & Tạp chí",
  ]) assert.ok(migration.includes(category));
  for (const old of [
    "AI & Công nghệ",
    "Apple & Thiết bị",
    "Video & Sáng tạo",
    "Hạ tầng & Phần cứng",
    "Robot & Tự động hóa",
  ]) assert.ok(!migration.includes("category='"+old+"'"));
});
