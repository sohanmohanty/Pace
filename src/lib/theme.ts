import type { Settings, ThemeMode } from "../data/types";

export type ResolvedTheme = "light" | "dark" | "hc";

/** The theme to render for a settings record, honoring the system preference. */
export function resolveTheme(settings: Pick<Settings, "theme" | "highContrast">): ResolvedTheme {
  const mode: ThemeMode = settings.theme ?? (settings.highContrast ? "hc" : "dark");
  if (mode === "hc") return "hc";
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "dark", label: "Dark", hint: "Deep ink." },
  { value: "light", label: "Light", hint: "Warm paper." },
  { value: "system", label: "Match device", hint: "Light or dark, whichever your device uses." },
  { value: "hc", label: "High contrast", hint: "Black on white, stronger borders." }
];

/** Apply the theme and the capacity tint hue to the document root. */
export function applyTheme(theme: ResolvedTheme, hue?: number) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (hue !== undefined) root.style.setProperty("--cap-h", String(Math.round(hue)));
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === "dark" ? "#1a1c22" : theme === "hc" ? "#ffffff" : "#f7f5f0";
  }
}
