export type Theme = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "postflow-theme";

export const THEMES: Theme[] = ["light", "dark", "system"];

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/** Inline script (stringified) to inject before hydration to prevent flash. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("postflow-theme")||"system";var d=document.documentElement;if(t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme:dark)").matches)){d.classList.add("dark")}else{d.classList.remove("dark")}}catch(e){}})();`;
