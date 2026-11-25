// How this machine's CodeDeck looks (docs/STYLING.md): a colour theme and a style from the be spex kit
// (@bespex/themes, the same choice as in every be spex app), and CodeDeck's own setting how loud events
// are. Like the language, the choice lives in the machine settings that every window shares;
// `localStorage` keeps what was last put on the page, so that the first picture of the next start is
// already right (public/theme-early.js).

import { useEffect, useState } from "react";
import { apply, normalize, resolveStyle, type Appearance, type Axis, type Style } from "@bespex/themes";
import { machineSettings, onSettingsChanged, setMachineSetting } from "./backend";

/** How much events stand out: a session done or asking, work going on, new entries. */
export type Events = "quiet" | "clear" | "loud";
export const EVENTS: Events[] = ["quiet", "clear", "loud"];

/** The default: Graphite (the former theme "CodeDeck"), soft corners, tinted regions. */
export const DEFAULT_APPEARANCE: Appearance = normalize({ theme: "graphite", style: "calm" });
export const DEFAULT_EVENTS: Events = "clear";

/** The style axes that change something in CodeDeck; the picker offers only these. CodeDeck marks no
 *  bars or emphasis zones and keeps its own density. */
export const AXES_USED: Axis[] = ["shape", "structure", "color", "effects"];

/** A colour theme with the steps that differ from the default style. */
const look = (theme: string, style: Partial<Style> = {}): Appearance => normalize({ theme, style });

/** The themes before the kit (machine setting `theme`), each as colour theme, style and events. */
const LEGACY: Record<string, { appearance: Appearance; events: Events }> = {
  codedeck: { appearance: DEFAULT_APPEARANCE, events: "clear" },
  paper: { appearance: look("paper", { shape: "round", color: "tinted", effects: "subtle" }), events: "clear" },
  colorful: { appearance: look("colorful", { shape: "round", color: "colorful", effects: "rich" }), events: "loud" },
  moon: { appearance: look("moon", { shape: "round", structure: "depth", effects: "subtle" }), events: "clear" },
  forest: { appearance: look("forest", { shape: "round" }), events: "clear" },
  elegance: { appearance: look("elegance", { shape: "round", effects: "subtle" }), events: "clear" },
  fancy: { appearance: look("neon", { color: "neutral", effects: "rich" }), events: "loud" },
  terminal: { appearance: look("terminal", { shape: "sharp", structure: "lines", color: "neutral" }), events: "clear" },
  contrast: { appearance: look("contrast", { shape: "sharp", structure: "lines", color: "neutral" }), events: "loud" },
};

/** What index.html reads before anything else runs: `{ attrs, classes }` */
const CACHE = "codedeck.theme";

let appearance = DEFAULT_APPEARANCE;
let events: Events = DEFAULT_EVENTS;
const listeners = new Set<() => void>();

let applied: string[] = [];
/** Puts the choice on the page and remembers it for the next start. */
function put() {
  const root = document.documentElement;
  apply(appearance, root);
  const style = resolveStyle(appearance.style);
  // Steps that switch rules on in index.css
  const classes: string[] = [];
  if (style.effects !== "none") classes.push("theme-gradient", "theme-glass");
  if (style.effects === "rich") classes.push("theme-backdrop");
  if (style.color !== "neutral") classes.push("theme-zones");
  if (events !== "quiet") classes.push(`theme-events-${events}`);
  root.classList.remove(...applied);
  root.classList.add(...classes);
  applied = classes;
  const attrs = Object.fromEntries([...root.attributes].filter((a) => a.name.startsWith("data-sx-")).map((a) => [a.name, a.value]));
  localStorage.setItem(CACHE, JSON.stringify({ attrs, classes }));
}

const changed = () => {
  put();
  listeners.forEach((l) => l());
};

/** Chooses colour theme and style for this machine, in every window. */
export function setAppearance(value: Appearance) {
  appearance = normalize(value);
  changed();
  void setMachineSetting("appearance", appearance);
  void setMachineSetting("theme", null);
}

/** Only the colour theme, the style stays (for `tools/shot.mjs`: `eval:theme("paper")`). */
export function setTheme(id: string) {
  setAppearance({ ...appearance, theme: LEGACY[id]?.appearance.theme ?? id });
}

export function setEvents(value: Events) {
  events = EVENTS.includes(value) ? value : DEFAULT_EVENTS;
  changed();
  void setMachineSetting("events", events === DEFAULT_EVENTS ? null : events);
}

/** The choice; draws again when it changes, here or in another window. */
export function useTheme(): { appearance: Appearance; events: Events } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return { appearance, events };
}

/** The choice from the machine settings; a theme chosen before the kit is translated. */
export function fromSettings(settings: Record<string, unknown>): { appearance: Appearance; events: Events } {
  const legacy = typeof settings.theme === "string" ? LEGACY[settings.theme] : undefined;
  // "focus" (loud only for what needs you) left the choice; it reads as "clear"
  const stored = settings.events === "focus" ? "clear" : settings.events;
  return {
    appearance: settings.appearance ? normalize(settings.appearance) : (legacy?.appearance ?? DEFAULT_APPEARANCE),
    events: EVENTS.includes(stored as Events) ? (stored as Events) : (legacy?.events ?? DEFAULT_EVENTS),
  };
}

/** The machine settings at start, and again when another window changed them. */
async function follow() {
  const settings = await machineSettings().catch(() => ({}) as Record<string, unknown>);
  const next = fromSettings(settings);
  appearance = next.appearance;
  events = next.events;
  changed();
}

if (typeof window !== "undefined") {
  // For checking themes in the preview from outside (tools/shot.mjs `eval:`), like `missingTranslations`
  Object.assign(window, { theme: setTheme, look: setAppearance });
  void follow();
  onSettingsChanged(() => void follow());
}
