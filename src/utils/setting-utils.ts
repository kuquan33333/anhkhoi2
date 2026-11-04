import {
	AUTO_MODE,
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
} from "@constants/constants.ts";
import { expressiveCodeConfig } from "@/config";
import type { LIGHT_DARK_MODE } from "@/types/config";

export function getDefaultHue(): number {
	const fallback = "250";
	const configCarrier = document.getElementById("config-carrier");
	return Number.parseInt(configCarrier?.dataset.hue || fallback, 10);
}

export function getHue(): number {
	const stored = localStorage.getItem("hue");
	// The former site default (224) was never selectable by the 5-degree slider.
	// Migrate only that legacy default; preserve visitors' chosen Fuwari hue.
	if (stored === "224" && localStorage.getItem("ak-fuwari-palette-v2") !== "1") {
		localStorage.setItem("ak-fuwari-palette-v2", "1");
		localStorage.removeItem("hue");
		return getDefaultHue();
	}
	const hue = Number(stored);
	return stored !== null && Number.isFinite(hue) && hue >= 0 && hue <= 360
		? hue : getDefaultHue();
}

export function setHue(hue: number): void {
	const normalized = Number.isFinite(hue) ? Math.max(0, Math.min(360, hue)) : getDefaultHue();
	localStorage.setItem("hue", String(normalized));
	const r = document.querySelector(":root") as HTMLElement;
	if (!r) {
		return;
	}
	r.style.setProperty("--hue", String(normalized));
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
	const root = document.documentElement;
	const isDark = theme === DARK_MODE ||
		(theme === AUTO_MODE && window.matchMedia("(prefers-color-scheme: dark)").matches);
	root.classList.toggle("dark", isDark);
	root.dataset.appliedTheme = isDark ? DARK_MODE : LIGHT_MODE;
	root.style.colorScheme = isDark ? DARK_MODE : LIGHT_MODE;
	// Keep mobile browser chrome consistent with the visible Fuwari surface.
	document.querySelector('meta[name="theme-color"]')?.setAttribute(
		"content",
		isDark ? "#11151d" : "#ebedf5",
	);
	// Expressive Code keeps its own supported syntax-highlighting theme.
	root.setAttribute("data-theme", expressiveCodeConfig.theme);
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	localStorage.setItem("theme", theme);
	applyThemeToDocument(theme);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	const value = localStorage.getItem("theme");
	return value === LIGHT_MODE || value === DARK_MODE || value === AUTO_MODE
		? value : DEFAULT_THEME;
}
