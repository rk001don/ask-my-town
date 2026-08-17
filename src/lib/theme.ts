// Theme selection: "system" (default), "light", or "dark".
//
// "system" deliberately stamps NOTHING on <html> -- the CSS handles it via
// prefers-color-scheme. An explicit choice stamps data-theme, which the CSS
// gives higher precedence so the toggle wins over the OS in both directions.

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "mytown.theme";

/**
 * Runs before first paint, inlined into <head>.
 *
 * Without this the server-rendered HTML paints the default (light) and then
 * React corrects it on hydration -- a white flash on every load for anyone
 * using dark mode, which is exactly the cheap-feeling detail this phase is
 * meant to remove. Kept dependency-free and tiny since it blocks paint.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});
if(c==="light"||c==="dark"){document.documentElement.setAttribute("data-theme",c);}
}catch(e){}})();`;

export function readThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    // Private browsing / storage disabled -- follow the OS rather than failing.
    return "system";
  }
}

export function applyThemeChoice(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
}

/** What the user is actually looking at right now, resolving "system". */
export function resolveTheme(choice: ThemeChoice): "light" | "dark" {
  if (choice !== "system") return choice;
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
