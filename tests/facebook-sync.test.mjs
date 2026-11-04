import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const workerSource = readFileSync(
  new URL("../workers/facebook-sync/worker.js", import.meta.url), "utf8"
);
const helpers = runInNewContext(
  workerSource.slice(0, workerSource.indexOf("export default {")) +
    "\n({ attr, detailFromHtml, discoverFromHtml, discoverFromDomCards, normalizeFacebookUrl, isGenericFacebookMetadata, profileSources })",
  { URL, TextEncoder, crypto: globalThis.crypto }
);

test("HTML attribute reader correctly handles quoted values", () => {
  const tag = '<img src="https://scontent.fbcdn.net/a.jpg" alt="Hello Facebook">';
  assert.equal(helpers.attr(tag, "src"), "https://scontent.fbcdn.net/a.jpg");
  assert.equal(helpers.attr(tag, "alt"), "Hello Facebook");
  assert.equal(helpers.attr("<a href='/reel/1234567890123'>", "href"), "/reel/1234567890123");
});

test("Facebook HTML metadata keeps caption, images and video dimensions", () => {
  const html = [
    '<meta property="og:description" content="Nội dung caption đầy đủ">',
    '<meta property="og:image" content="https://scontent.fbcdn.net/a.jpg">',
    '<meta property="og:image" content="https://scontent.fbcdn.net/b.jpg">',
    '<meta property="og:video:width" content="1080">',
    '<meta property="og:video:height" content="1920">'
  ].join("");
  const item = helpers.detailFromHtml(html, "https://www.facebook.com/reel/1234567890123");
  assert.equal(item.description, "Nội dung caption đầy đủ");
  assert.deepEqual([...item.images], [
    "https://scontent.fbcdn.net/a.jpg", "https://scontent.fbcdn.net/b.jpg"
  ]);
  assert.equal(item.mediaWidth, 1080);
  assert.equal(item.mediaHeight, 1920);
});

test("Reel tiles expose permalink, thumbnail and public alt text", () => {
  const html = '<a aria-label="Reel tile preview" href="/reel/1234567890123">' +
    '<img src="https://scontent.fbcdn.net/thumbnail.jpg" alt="Đây là caption công khai của video">' +
    '</a>';
  const items = helpers.discoverFromHtml(html, "https://www.facebook.com/profile.php?id=61595505020148");
  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, "reel");
  assert.equal(items[0].thumbnailUrl, "https://scontent.fbcdn.net/thumbnail.jpg");
  assert.equal(items[0].anchorText, "Đây là caption công khai của video");
});

test("bare Facebook photo navigation links are not mistaken for feed posts", () => {
  const html = '<a href="/photo.php?fbid=122108148453516834">Photo</a>';
  const items = helpers.discoverFromHtml(html, "https://www.facebook.com/profile.php?id=61595505020148");
  assert.equal(items.length, 0);
});

test("real DOM feed cards preserve photo caption and image evidence", () => {
  const map = helpers.discoverFromDomCards([{
    href:"https://www.facebook.com/photo.php?fbid=122108148453516834",
    text:"Một bài đăng có ảnh và caption thật",
    images:["https://scontent.fbcdn.net/post-photo.jpg"]
  }], "https://www.facebook.com/profile.php?id=61595505020148");
  const items = helpers.discoverFromHtml("", "https://www.facebook.com/profile.php?id=61595505020148", map);
  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, "photo");
  assert.equal(items[0].anchorText, "Một bài đăng có ảnh và caption thật");
  assert.deepEqual([...items[0].imageUrls], ["https://scontent.fbcdn.net/post-photo.jpg"]);
});

test("reel and video URL variants dedupe by Facebook content ID", () => {
  const html = [
    '<a href="/reel/1234567890123">Reel</a>',
    '<a href="/61595505020148/videos/1234567890123">Video</a>'
  ].join("");
  const items = helpers.discoverFromHtml(html, "https://www.facebook.com/profile.php?id=61595505020148");
  assert.equal(items.length, 1);
  assert.equal(items[0].facebookId, "1234567890123");
});

test("generic Facebook Watch metadata is rejected", () => {
  assert.equal(helpers.isGenericFacebookMetadata({
    title:"Khám phá các video phổ biến | Facebook",
    description:"Tab Video là nơi để cùng thưởng thức các video và chương trình.",
    canonical:"https://www.facebook.com/watch"
  }), true);
  assert.equal(helpers.isGenericFacebookMetadata({
    title:"Bài thật",
    description:"Caption thật",
    canonical:"https://www.facebook.com/photo.php?fbid=1234567890123",
    image:"https://scontent.fbcdn.net/a.jpg"
  }), false);
});

test("deep sync source plan includes profile, posts, photos, videos and reels", () => {
  const list = helpers.profileSources(
    "https://www.facebook.com/profile.php?id=61595505020148",
    "https://www.facebook.com/profile.php?id=61595505020148&sk=reels_tab"
  );
  assert.equal(list.length, 5);
  assert.ok(list.some(x=>x.includes("sk=posts")));
  assert.ok(list.some(x=>x.includes("sk=photos")));
  assert.ok(list.some(x=>x.includes("sk=videos")));
  assert.ok(list.some(x=>x.includes("reels_tab")));
});

test("Only Facebook links are accepted for discovered content", () => {
  assert.equal(
    helpers.normalizeFacebookUrl("/reel/1234567890123", "https://www.facebook.com/profile.php?id=61595505020148"),
    "https://www.facebook.com/reel/1234567890123"
  );
  assert.equal(
    helpers.normalizeFacebookUrl("https://evilfacebook.com/reel/1234567890123", "https://www.facebook.com"),
    null
  );
});
