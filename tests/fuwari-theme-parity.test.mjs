import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Admin theme CSS is route-local and cannot leak its dark body gradient", () => {
  const admin = read("src/pages/admin.astro");
  assert.match(admin, /<style is:inline>/);
  assert.match(admin, /<html lang="vi" class="ak-admin-root">/);
  assert.match(admin, /<body class="ak-admin-page">/);
  assert.match(admin, /body\.ak-admin-page\{[^}]*radial-gradient/);
  assert.doesNotMatch(admin, /<style>\s*:root\{/);
});

test("Core palette matches upstream Fuwari defaults", () => {
  const vars = read("src/styles/variables.styl");
  const config = read("src/config.ts");
  assert.match(vars, /--primary:\s*oklch\(0\.70 0\.14 var\(--hue\)\) oklch\(0\.75 0\.14 var\(--hue\)\)/);
  assert.match(vars, /--page-bg:\s*oklch\(0\.95 0\.01 var\(--hue\)\) oklch\(0\.16 0\.014 var\(--hue\)\)/);
  assert.match(vars, /--card-bg:\s*white oklch\(0\.23 0\.015 var\(--hue\)\)/);
  assert.match(vars, /--btn-content:\s*oklch\(0\.55 0\.12 var\(--hue\)\) oklch\(0\.75 0\.1 var\(--hue\)\)/);
  assert.match(config, /themeColor:\s*\{ hue: 250, fixed: false \}/);
});

test("Fuwari text utilities and root background class are restored", () => {
  const css = read("src/styles/main.css");
  const layout = read("src/layouts/Layout.astro");
  assert.match(css, /\.text-90\s*\{\s*@apply text-black\/90 dark:text-white\/90/);
  assert.match(css, /\.text-75\s*\{\s*@apply text-black\/75 dark:text-white\/75/);
  assert.match(css, /\.text-50\s*\{\s*@apply text-black\/50 dark:text-white\/50/);
  assert.doesNotMatch(css, /background-color:\s*var\(--page-bg\)\s*!important/);
  assert.doesNotMatch(css, /html:not\(\.dark\)/);
  assert.match(layout, /class="bg-\[var\(--page-bg\)\] transition text-\[14px\] md:text-\[16px\]"/);
});

test("Light/dark/auto switch uses the original Fuwari component", () => {
  const navbar = read("src/components/Navbar.astro");
  const switcher = read("src/components/LightDarkSwitch.svelte");
  assert.match(navbar, /import LightDarkSwitch from "\.\/LightDarkSwitch\.svelte"/);
  assert.match(navbar, /<LightDarkSwitch client:only="svelte"><\/LightDarkSwitch>/);
  assert.doesNotMatch(navbar, /import \{ setTheme \}/);
  assert.match(switcher, /const seq: LIGHT_DARK_MODE\[\] = \[LIGHT_MODE, DARK_MODE, AUTO_MODE\]/);
});

test("Old hue 224 is migrated once without overwriting other user choices", () => {
  const layout = read("src/layouts/Layout.astro");
  assert.match(layout, /localStorage\.getItem\('hue'\) === '224'/);
  assert.match(layout, /ak-fuwari-theme-parity-v1/);
  assert.match(layout, /localStorage\.setItem\('hue', String\(configHue\)\)/);
});

test("Hard-coded dark surfaces outside Admin are limited to media/code contexts", () => {
  const feed = read("src/components/FacebookRuntimeFeed.astro");
  const main = read("src/styles/main.css");
  assert.match(feed, /ak-runtime-video-stage[^\n]*background:#0a1428/);
  assert.match(main, /ak-reel-embed[^\n]*background:#050a13/);
  assert.doesNotMatch(read("src/layouts/Layout.astro"), /radial-gradient|#07101f/);
  assert.doesNotMatch(read("src/layouts/MainGridLayout.astro"), /radial-gradient|#07101f/);
});
