import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const categories = [
  "Công nghệ & AI",
  "Khoa học & Khám phá",
  "Quân sự & Công nghệ quốc phòng",
  "Du lịch & Trải nghiệm",
  "Văn hóa & Sáng tạo",
  "Học tập & Kỹ năng số",
  "Sức khỏe & Đời sống",
  "Thể thao",
  "Góc nhìn & Phân tích",
];

test("editorial taxonomy is focused and category pages are explicit", () => {
  const helper = read("functions/_editorial.js");
  const constants = read("src/constants/editorial-taxonomy.ts");
  const categoryPage = read("src/pages/chuyen-muc/[slug].astro");
  for (const category of categories) {
    assert.ok(helper.includes(category));
    assert.ok(constants.includes(category));
  }
  for (const old of [
    "Thời sự & Xã hội","Thế giới","Pháp luật & An ninh",
    "Đời sống & Tạp chí","Kinh tế & Kinh doanh","Khoa học & Thiên văn"
  ]) assert.ok(!helper.includes(`"${old}"`));
  assert.match(categoryPage, /getStaticPaths/);
  assert.match(categoryPage, /mode="category"/);
});

test("taxonomy API keeps sidebar compact and hides archived editorial items", () => {
  const api = read("functions/api/post-taxonomy.js");
  assert.match(api, /filter\(item => item\.count >= 2\)/);
  assert.match(api, /slice\(0, 15\)/);
  assert.match(api, /ARCHIVE/);
  assert.match(api, /REMOVE_DUPLICATE/);
});

test("admin exposes focused categories and structured editorial fields", () => {
  const admin = read("src/pages/admin.astro");
  for (const category of categories) assert.ok(admin.includes(category));
  assert.match(admin, /Chủ đề \(tối đa 5/);
  assert.match(admin, /manualSources/);
  assert.match(admin, /manualMedia/);
  assert.match(admin, /manualEditorialAction/);
  assert.match(admin, /manualEditorialNotes/);
  assert.match(admin, /editorial-warnings/);
  assert.doesNotMatch(admin, /value="kuquan96"/);
});
