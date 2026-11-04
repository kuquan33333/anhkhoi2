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
	switch (theme) {
		case LIGHT_MODE:
			document.documentElement.classList.remove("dark");
			break;
		case DARK_MODE:
			document.documentElement.classList.add("dark");
			break;
		case AUTO_MODE:
			if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
			break;
	}

	// Set the theme for Expressive Code
	document.documentElement.setAttribute(
		"data-theme",
		expressiveCodeConfig.theme,
	);
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	localStorage.setItem("theme", theme);
	applyThemeToDocument(theme);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	return (localStorage.getItem("theme") as LIGHT_DARK_MODE) || DEFAULT_THEME;
}
