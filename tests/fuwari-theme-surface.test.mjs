import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Fuwari page underlay starts after the banner's original overlap", () => {
  const grid = read("src/layouts/MainGridLayout.astro");
  assert.match(grid, /id="main-grid" style=\{\`--surface-overlap:/);
  assert.match(grid, /class="relative isolate transition/);
  assert.match(grid, /#main-grid::before/);
  assert.match(grid, /width:\s*100vw/);
  assert.match(grid, /background-color:\s*var\(--page-bg\)/);
  assert.match(grid, /\.enable-banner #main-grid::before\s*\{\s*top:\s*var\(--surface-overlap\)/);
  assert.match(grid, /pointer-events:\s*none/);
});

test("light and dark use original Fuwari page/card color tokens", () => {
  const vars = read("src/styles/variables.styl");
  assert.match(vars, /--page-bg:\s*oklch\(0\.95 0\.01 var\(--hue\)\)\s+oklch\(0\.16 0\.014 var\(--hue\)\)/);
  assert.match(vars, /--card-bg:\s*white\s+oklch\(0\.23 0\.015 var\(--hue\)\)/);
  const css = read("src/styles/main.css");
  assert.match(css, /html\.dark, html\.dark body/);
  assert.match(css, /html:not\(\.dark\), html:not\(\.dark\) body/);
});

test("theme switch is Fuwari's real three-mode Svelte component, not dual toggles", () => {
  const navbar = read("src/components/Navbar.astro");
  const switcher = read("src/components/LightDarkSwitch.svelte");
  assert.match(navbar, /<LightDarkSwitch client:only="svelte"/);
  assert.equal((navbar.match(/id="scheme-switch"/g) || []).length, 0);
  assert.doesNotMatch(navbar, /function switchTheme\(/);
  assert.match(switcher, /\[LIGHT_MODE, DARK_MODE, AUTO_MODE\]/);
  assert.match(switcher, /prefers-color-scheme: dark/);
  assert.match(switcher, /applyThemeToDocument\(mode\)/);
});

test("theme is initialized before paint, including original Fuwari hue and auto mode", () => {
  const layout = read("src/layouts/Layout.astro");
  const theme = read("src/utils/setting-utils.ts");
  const config = read("src/config.ts");
  assert.match(config, /themeColor: \{ hue: 250, fixed: false \}/);
  assert.match(layout, /root\.classList\.toggle\('dark', dark\)/);
  assert.match(layout, /root\.style\.colorScheme = dark \? DARK_MODE : LIGHT_MODE/);
  assert.match(layout, /localStorage\.getItem\('ak-fuwari-palette-v2'\)/);
  assert.match(theme, /value === LIGHT_MODE \|\| value === DARK_MODE \|\| value === AUTO_MODE/);
  assert.match(theme, /window\.matchMedia\("\(prefers-color-scheme: dark\)"\)/);
});

test("Facebook player keeps its intentional dark video stage independently from page theme", () => {
  const css = read("src/components/FacebookRuntimeFeed.astro");
  const grid = read("src/layouts/MainGridLayout.astro");
  assert.match(css, /\.ak-runtime-video-stage\{[^}]*background:#0a1428/);
  assert.match(grid, /#main-grid::before/);
});
