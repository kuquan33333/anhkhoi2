import test from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORY_OPTIONS,
  editorialWarnings,
  normalizeSources,
  normalizeTags,
} from "../functions/_editorial.js";

test("editorial helper exposes the focused nine-category taxonomy", () => {
  assert.equal(CATEGORY_OPTIONS.length, 9);
  assert.ok(CATEGORY_OPTIONS.includes("Du lịch & Trải nghiệm"));
  assert.ok(CATEGORY_OPTIONS.includes("Quân sự & Công nghệ quốc phòng"));
  assert.ok(!CATEGORY_OPTIONS.includes("Thời sự & Xã hội"));
});

test("structured sources are deduplicated and require safe http(s) URLs", () => {
  const sources = normalizeSources([
    {name:"NASA",title:"Mission data",url:"https://www.nasa.gov/",type:"official"},
    {name:"NASA",title:"Mission data",url:"https://www.nasa.gov/",type:"official"},
    {name:"Bad",title:"Unsafe",url:"javascript:alert(1)",type:"reference"},
  ]);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://www.nasa.gov/");
  assert.equal(sources[1].url, "");
});

test("quality gate catches missing sources, cover, short body and duplicate paragraphs", () => {
  const para = "Đây là một đoạn nội dung đủ dài để kiểm tra cơ chế phát hiện lặp trong quy trình biên tập trước khi xuất bản bài viết trên website.";
  const warnings = editorialWarnings({
    title:"Bài kiểm tra",
    excerpt:"Mô tả quá ngắn",
    bodyMarkdown:para+"\n\n"+para,
    category:"Công nghệ & AI",
    tags:normalizeTags(["AI","AI","Robot"]),
    sources:[],
    media:[],
    coverR2Key:"",
  });
  const codes = new Set(warnings.map(x => x.code));
  for (const code of ["body_short","cover_missing","sources_missing","duplicate_paragraph"]) {
    assert.ok(codes.has(code), code);
  }
});

test("health and military categories always surface review reminders", () => {
  const base = {
    title:"Bài chuyên đề",
    excerpt:"Một mô tả đủ dài để mô phỏng nội dung biên tập có nguồn và không bị cảnh báo excerpt quá ngắn trong phép thử.",
    bodyMarkdown:"Nội dung ".repeat(600),
    tags:["Kiến thức"],
    sources:[{name:"Nguồn chính thức",title:"Tài liệu",url:"https://example.com/",type:"official"}],
    media:[],
    coverR2Key:"admin/example.webp",
  };
  assert.ok(editorialWarnings({...base,category:"Sức khỏe & Đời sống"}).some(x=>x.code==="health_review"));
  assert.ok(editorialWarnings({...base,category:"Quân sự & Công nghệ quốc phòng"}).some(x=>x.code==="military_review"));
});
