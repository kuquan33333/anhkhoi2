import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const workerSource = readFileSync(
  new URL("../workers/facebook-sync/worker.js", import.meta.url), "utf8"
);
const helpers = runInNewContext(
  workerSource.slice(0, workerSource.indexOf("export default {")) +
    "\n({ attr, detailFromHtml, discoverFromHtml, normalizeFacebookUrl })",
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
