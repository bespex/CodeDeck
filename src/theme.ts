// The theme of this machine (docs/STYLING.md): which one is chosen, putting it on the page, trying one
// out while the pointer is on it. Like the language, the choice lives in the machine settings that every
// window shares; `localStorage` keeps the variables last put on the page, so that the first picture of
// the next start is already in the theme (see the script in index.html).

import { useEffect, useState } from "react";
import { machineSettings, onSettingsChanged, setMachineSetting } from "./backend";
import { cssOf, derive, type Roles, type Theme } from "./palette";

/** The shipped themes, in the order they are offered: the default first. */
const files = import.meta.glob<Theme>("./themes/*.json", { eager: true, import: "default" });
const ORDER = ["codedeck", "paper", "graphite", "signal"];
export const THEMES: Theme[] = Object.values(files).sort((a, b) => rank(a.id) - rank(b.id));
function rank(id: string) {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
}
export const DEFAULT_THEME = "codedeck";

/** What index.html reads before anything else runs: `{ vars, classes }` */
const CACHE = "codedeck.theme";

let chosen = DEFAULT_THEME;
let reduce = false;
const listeners = new Set<() => void>();

const byId = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;

/** The roles of a theme, for previews (the colour strip in the list). */
const roles = new Map<string, Roles>();
export function rolesOf(theme: Theme): Roles {
  let r = roles.get(theme.id);
  if (!r) roles.set(theme.id, (r = derive(theme)));
  return r;
}

let applied: string[] = [];
/** Puts a theme on the page; `keep` also remembers it for the next start. */
function put(theme: Theme, keep: boolean) {
  const { vars, classes } = cssOf(rolesOf(theme), { reduceTransparency: reduce });
  const root = document.documentElement;
  for (const name of [...root.style].filter((p) => p.startsWith("--t-"))) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.classList.remove(...applied);
  root.classList.add(...classes);
  applied = classes;
  if (keep) localStorage.setItem(CACHE, JSON.stringify({ vars, classes }));
}

/** Shows a theme without choosing it (the pointer is on it in a list); `null` goes back to the chosen one. */
export function previewTheme(id: string | null) {
  put(byId(id ?? chosen), false);
}

/** Chooses a theme for this machine, in every window. */
export function setTheme(id: string) {
  chosen = byId(id).id;
  put(byId(chosen), true);
  listeners.forEach((l) => l());
  void setMachineSetting("theme", chosen === DEFAULT_THEME ? null : chosen);
}

/** Glass becomes opaque whatever the theme says (a setting of the user, not of the theme). */
export function setReduceTransparency(on: boolean) {
  reduce = on;
  put(byId(chosen), true);
  listeners.forEach((l) => l());
  void setMachineSetting("reduceTransparency", on || null);
}

/** The chosen theme and the transparency setting; draws again when either changes, here or in another window. */
export function useTheme(): { theme: string; reduceTransparency: boolean } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return { theme: chosen, reduceTransparency: reduce };
}

/** The machine settings at start, and again when another window changed them. */
async function follow() {
  const settings = await machineSettings().catch(() => ({}) as Record<string, unknown>);
  const id = typeof settings.theme === "string" ? byId(settings.theme).id : DEFAULT_THEME;
  const off = settings.reduceTransparency === true;
  if (id === chosen && off === reduce && applied.length + document.documentElement.style.length > 0) return;
  chosen = id;
  reduce = off;
  put(byId(chosen), true);
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  // For checking themes in the preview from outside (tools/shot.mjs `eval:`), like `missingTranslations`
  (window as unknown as { theme: (id: string) => void }).theme = setTheme;
  void follow();
  onSettingsChanged(() => void follow());
}
