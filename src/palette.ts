// Themes as data (docs/STYLING.md): a theme names a few colours and steps, everything else is derived
// here, and the same functions check that a theme stays readable and keeps the meaning of each colour.
// No imports, no DOM: `tools/theme-check.mjs` runs this file under Node as well.

/** The steps a theme may choose; each acts in one place the components already know (STYLING.md B4). */
export interface Style {
  radius?: "sharp" | "default" | "round";
  lines?: "subtle" | "clear" | "strong";
  /** How strongly the areas (assistant, you, waiting) are tinted, in percent */
  areaTint?: number;
  /** How much of `tint` goes into the greys, in percent */
  surfaceTint?: number;
  glow?: "none" | "soft" | "bright";
  depth?: "flat" | "soft" | "deep";
  motion?: "calm" | "lively";
  font?: "system" | "inter" | "rounded" | "mono";
  glass?: "none" | "soft" | "strong";
  gradient?: "none" | "subtle" | "vivid";
  backdrop?: "none" | "glow" | "aurora";
  /** How strongly the regions of the window are coloured (files, tabs, right column, status bar), in percent; 0 = all grey */
  zones?: number;
  /** How much events stand out: a session done or asking, work going on, new entries. `focus`: only
   *  what needs the user is loud (a question, waiting for you), the rest as with `clear` */
  events?: "quiet" | "clear" | "focus" | "loud";
  /** Not built yet: needs a window made transparent (STYLING.md B4a); taken as `opaque` */
  window?: "opaque" | "translucent";
}

/** A theme file. Required are the colours with meaning; the rest is derived unless the theme sets it. */
export interface Theme {
  id: string;
  name: string;
  scheme: "dark" | "light";
  bg: string;
  fg: string;
  accent: string;
  ai: string;
  wait: string;
  added: string;
  problem: string;
  moved: string;
  /** The colour that goes into the greys with `surfaceTint` and into the backdrop; default `ai` */
  tint?: string;
  accent2?: string;
  accentSoft?: string;
  accentFill?: string;
  accentFillHover?: string;
  onAccent?: string;
  sessions?: string[];
  /** The colour of a finished turn, as an event; default `added` */
  done?: string;
  /** Where the regions take their colour from, with `zones`; defaults: files `moved`, tabs `tint`, side `ai`, bar `accent` */
  zoneColors?: Partial<Record<"files" | "tabs" | "side" | "bar", string>>;
  /** The regions' surfaces exactly, where mixing a little colour into the panel is not enough (a green
   *  bar on a brown ground); a region not named here is mixed as usual */
  zoneSurfaces?: Partial<Record<"files" | "tabs" | "side" | "bar", string>>;
  /** The neutral scale, 11 steps from the strongest contrast to the ground (50 … 950) */
  neutral?: string[];
  surfaces?: Partial<Record<"base" | "panel" | "raised" | "line" | "overlay" | "overlayHover" | "overlayLine", string>>;
  style?: Style;
}

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/* ---------- Colour maths: OKLab for mixing, WCAG for contrast ---------- */

type Rgb = [number, number, number];
type Lab = [number, number, number];

function rgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);

function lab(hex: string): Lab {
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex(
    [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(gam),
  );
}
/** `x` moved by `t` (0 … 1) towards `y`, in OKLab */
export function mix(x: string, y: string, t: number): string {
  const a = lab(x), b = lab(y);
  return fromLab(a.map((v, i) => v + (b[i] - v) * t) as Lab);
}
function lch(hex: string): [number, number, number] {
  const [L, a, b] = lab(hex);
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}
const fromLch = (L: number, C: number, h: number) => fromLab([L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)]);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG contrast ratio, 1 … 21 */
export function contrast(x: string, y: string): number {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
}
/** How far apart two colours look: OKLab distance × 100 */
export function distance(x: string, y: string): number {
  const a = lab(x), b = lab(y);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
}
/** `c` made lighter or darker, away from `against`, until it has `ratio` against it */
function reach(c: string, against: string, ratio: number): string {
  let [L] = lch(c);
  const [, C, h] = lch(c);
  const up = luminance(against) < 0.18;
  for (let i = 0; i < 60 && contrast(fromLch(L, C, h), against) < ratio; i++) L += up ? 0.01 : -0.01;
  return fromLch(L, C, h);
}
const hueGap = (x: number, y: number) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));

/* ---------- Derivation ---------- */

/** Where each step of the neutral scale lies between `fg` (0) and `bg` (1) */
const AT: Record<(typeof STEPS)[number], number> = { 50: 0, 100: 0.04, 200: 0.12, 300: 0.2, 400: 0.27, 500: 0.35, 600: 0.5, 700: 0.8, 800: 0.86, 900: 0.91, 950: 1 };

/** All roles of a theme, plain colours and the values of its steps. */
export interface Roles {
  scheme: "dark" | "light";
  n: Record<(typeof STEPS)[number], string>;
  base: string;
  panel: string;
  raised: string;
  line: string;
  overlay: string;
  overlayHover: string;
  overlayLine: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  accentFill: string;
  accentFillHover: string;
  accentFill2: string;
  onAccent: string;
  ai: string;
  wait: string;
  added: string;
  problem: string;
  moved: string;
  sessions: string[];
  done: string;
  /** Text on a filled event: on `wait`, on `done`, on `ai` */
  onWait: string;
  onDone: string;
  onAi: string;
  /** The panel colour of each region (equal to `panel` without `zones`) */
  zone: Record<"files" | "tabs" | "side" | "bar", string>;
  tint: string;
  panelTop: string;
  style: Required<Style>;
}

export const DEFAULT_STYLE: Required<Style> = {
  radius: "default", lines: "subtle", areaTint: 6, surfaceTint: 0, glow: "soft", depth: "deep", motion: "calm",
  font: "system", glass: "none", gradient: "none", backdrop: "none", window: "opaque", zones: 0, events: "quiet",
};

/** Of two colours, the one that reads better on `fill` */
const textOn = (fill: string, a: string, b: string) => (contrast(a, fill) >= contrast(b, fill) ? a : b);

/** How opaque floating surfaces are, in percent, by step of `glass` */
export const GLASS = { none: 100, soft: 86, strong: 72 } as const;

export function derive(t: Theme): Roles {
  const style = { ...DEFAULT_STYLE, ...t.style };
  const light = t.scheme === "light";
  const tint = t.tint ?? t.ai;
  const tone = (at: number) => {
    let c = mix(t.fg, t.bg, at);
    if (style.surfaceTint) {
      const [L] = lch(c);
      const [, C, h] = lch(tint);
      c = mix(c, fromLch(L, Math.min(C, 0.12) * (0.4 + at * 0.6), h), style.surfaceTint / 100);
    }
    return c;
  };
  const n = Object.fromEntries(STEPS.map((s, i) => [s, t.neutral?.[i] ?? tone(AT[s])])) as Roles["n"];
  const lineAt = { subtle: 0.8, clear: 0.68, strong: 0.5 }[style.lines];
  const sf = t.surfaces ?? {};
  const panel = sf.panel ?? tone(0.955);
  let overlay = sf.overlay ?? (light ? mix(t.bg, "#ffffff", 0.7) : tone(0.84));
  // Glass keeps itself readable: the floating surface moves towards the ground until quiet text holds
  // even over bright text behind it (whose effect the blur about halves)
  const glass = GLASS[style.glass];
  if (glass < 100) for (let i = 0; i < 10 && contrast(n[500], mix(overlay, n[50], (100 - glass) / 200)) < 4; i++) overlay = mix(overlay, t.bg, 0.15);
  const onAccent = t.onAccent ?? (contrast("#ffffff", t.accent) >= contrast(t.bg, t.accent) ? "#ffffff" : t.bg);
  const accentFill = t.accentFill ?? reach(t.accent, onAccent, 4.5);
  // The second colour of the accent's gradient turns away from the meanings, not towards them
  const g = style.gradient;
  const [aL, aC, aH] = lch(t.accent);
  const turn = g === "vivid" ? 20 : 8;
  const room = (c: string) => Math.min(...[t.wait, t.problem, t.ai].map((m) => distance(c, m)));
  const turned = [-turn, turn].map((d) => fromLch(aL + (g === "vivid" ? 0.04 : 0.02), aC, (aH + d + 360) % 360)).sort((x, y) => room(y) - room(x))[0];
  const accent2 = t.accent2 ?? (g === "none" ? t.accent : turned);
  // Regions: the panel tinted towards a colour each; the bar a little more, it is thin
  const zc = { files: t.moved, tabs: tint, side: t.ai, bar: t.accent, ...t.zoneColors };
  const zt = style.zones / 100;
  const zone = { files: mix(panel, zc.files, zt), tabs: mix(panel, zc.tabs, zt), side: mix(panel, zc.side, zt), bar: mix(panel, zc.bar, zt * 1.3), ...t.zoneSurfaces };
  const done = t.done ?? t.added;
  return {
    scheme: t.scheme,
    n,
    base: sf.base ?? t.bg,
    panel,
    raised: sf.raised ?? tone(0.89),
    line: sf.line ?? tone(lineAt),
    overlay,
    overlayHover: sf.overlayHover ?? (light ? tone(0.93) : tone(0.77)),
    overlayLine: sf.overlayLine ?? tone(Math.min(lineAt, 0.7) - (light ? 0.05 : 0)),
    accent: t.accent,
    accent2,
    accentSoft: t.accentSoft ?? reach(t.accent, panel, 4.5),
    accentFill,
    accentFillHover: t.accentFillHover ?? mix(accentFill, onAccent === "#ffffff" ? "#000000" : "#ffffff", 0.1),
    accentFill2: g === "none" ? accentFill : reach(accent2, onAccent, 4.5),
    onAccent,
    ai: t.ai,
    wait: t.wait,
    added: t.added,
    problem: t.problem,
    moved: t.moved,
    sessions: t.sessions?.length === 6 ? t.sessions : sessionTones(t),
    done,
    onWait: textOn(t.wait, t.bg, t.fg),
    onDone: textOn(done, t.bg, t.fg),
    onAi: textOn(t.ai, t.bg, t.fg),
    zone,
    tint,
    panelTop: mix(panel, t.fg, { none: 0, subtle: 0.03, vivid: 0.06 }[g]),
    style,
  };
}

/** Six tones spread round the circle from the assistant's, none near a colour with meaning, none near each other. */
function sessionTones(t: Theme): string[] {
  const [L, C, h0] = lch(t.ai);
  const taken = [t.accent, t.wait, t.problem].map((c) => lch(c)[2]);
  let hues: number[] = [];
  for (const space of [55, 45, 36, 28]) {
    hues = [];
    for (let d = 0; d < 360 && hues.length < 6; d += 6) {
      const h = (h0 + d) % 360;
      if (taken.every((x) => hueGap(x, h) >= 40) && hues.every((x) => hueGap(x, h) >= space)) hues.push(h);
    }
    if (hues.length === 6) break;
  }
  while (hues.length < 6) hues.push((h0 + hues.length * 60) % 360);
  // Enough colour to tell six apart, and every other one a little lighter
  return hues.map((h, k) => fromLch(L + (k % 2 ? 0.05 : -0.02), Math.max(C, 0.12), h));
}

/** The CSS variables `index.css` reads (`--t-…`), and the classes for steps that switch rules on. */
export function cssOf(r: Roles, opts: { reduceTransparency?: boolean } = {}): { vars: Record<string, string>; classes: string[] } {
  const s = r.style;
  const light = r.scheme === "light";
  const glass = opts.reduceTransparency ? 100 : GLASS[s.glass];
  const vars: Record<string, string> = {
    "--t-scheme": r.scheme,
    "--t-base": r.base, "--t-panel": r.panel, "--t-raised": r.raised, "--t-line": r.line,
    "--t-overlay": r.overlay, "--t-overlay-hover": r.overlayHover, "--t-overlay-line": r.overlayLine,
    "--t-accent": r.accent, "--t-accent-soft": r.accentSoft, "--t-accent-fill": r.accentFill,
    "--t-accent-fill-hover": r.accentFillHover, "--t-accent-fill-2": r.accentFill2, "--t-accent-2": r.accent2, "--t-on-accent": r.onAccent,
    "--t-ai": r.ai, "--t-wait": r.wait, "--t-added": r.added, "--t-problem": r.problem, "--t-moved": r.moved,
    "--t-tint": r.tint, "--t-panel-top": r.panelTop,
    "--t-done": r.done, "--t-on-done": r.onDone, "--t-on-wait": r.onWait, "--t-on-ai": r.onAi,
    "--t-zone-files": r.zone.files, "--t-zone-tabs": r.zone.tabs, "--t-zone-side": r.zone.side, "--t-zone-bar": r.zone.bar,
    "--t-area": `${s.areaTint}%`,
    "--t-edge": light ? "rgb(0 0 0 / 0.14)" : "rgb(255 255 255 / 0.13)",
    "--t-edge-quiet": light ? "rgb(0 0 0 / 0.05)" : "rgb(255 255 255 / 0.05)",
    "--t-radius": String({ sharp: 0.35, default: 1, round: 1.8 }[s.radius]),
    "--t-glow": { none: "0px", soft: "6px", bright: "12px" }[s.glow],
    // How far the window's edge glows while something waits (`events`): a line, a halo
    "--t-edge-glow": { none: "0px", soft: "10px", bright: "28px" }[s.glow],
    "--t-shadow": {
      flat: "none",
      soft: light ? "0 6px 18px -6px rgb(0 0 0 / 0.18)" : "0 6px 18px -6px rgb(0 0 0 / 0.45)",
      deep: light ? "0 14px 36px -6px rgb(0 0 0 / 0.25), 0 2px 6px rgb(0 0 0 / 0.12)" : "0 14px 36px -6px rgb(0 0 0 / 0.6), 0 2px 6px rgb(0 0 0 / 0.35)",
    }[s.depth],
    "--t-pulses": s.motion === "lively" ? "5" : "3",
    "--t-light": { none: "0%", subtle: light ? "35%" : "3%", vivid: light ? "50%" : "6%" }[s.gradient],
    // Light from above is light: white on a light theme (its strongest text is dark), the strongest text on a dark one
    "--t-light-from": light ? "#ffffff" : r.n[50],
    "--t-flash": { quiet: "22%", clear: "30%", focus: "34%", loud: "42%" }[s.events],
    "--t-glass": `${glass}%`,
    "--t-glass-blur": { none: "0px", soft: "10px", strong: "18px" }[s.glass],
    "--t-backdrop": `${{ none: 0, glow: 6, aurora: 12 }[s.backdrop]}%`,
  };
  if (s.font !== "system") vars["--t-font"] = { inter: 'Inter, system-ui, "Noto Sans", sans-serif', rounded: '"Nunito", "Varela Round", system-ui, sans-serif', mono: 'ui-monospace, "JetBrains Mono", "Fira Code", "DejaVu Sans Mono", monospace' }[s.font];
  STEPS.forEach((step) => (vars[`--t-n${step}`] = r.n[step]));
  r.sessions.forEach((c, i) => (vars[`--t-session-${i}`] = c));
  const classes: string[] = [];
  if (s.gradient !== "none") classes.push("theme-gradient");
  if (s.backdrop !== "none") classes.push("theme-backdrop");
  if (glass < 100) classes.push("theme-glass");
  if (s.zones > 0) classes.push("theme-zones");
  if (s.events !== "quiet") classes.push(`theme-events-${s.events}`);
  return { vars, classes };
}

/* ---------- Check (STYLING.md B2, B3, B4a) ---------- */

export interface Finding {
  rule: string;
  /** The two colours compared */
  a: string;
  b: string;
  /** Contrast ratio, or distance for "apart" rules */
  value: number;
  need: number;
  kind: "contrast" | "apart";
  ok: boolean;
}

/** Every rule a theme has to meet; the shipped ones meet them all. */
export function check(t: Theme): Finding[] {
  const r = derive(t);
  const out: Finding[] = [];
  const pair = (rule: string, a: string, b: string, need: number) => {
    const value = contrast(a, b);
    out.push({ rule, a, b, value, need, kind: "contrast", ok: value >= need });
  };
  const apart = (rule: string, a: string, b: string, need = 8) => {
    const value = distance(a, b);
    out.push({ rule, a, b, value, need, kind: "apart", ok: value >= need });
  };
  for (const [name, c] of [["base", r.base], ["panel", r.panel], ["raised", r.raised], ["overlay", r.overlay]] as const) pair(`strongest text on ${name}`, r.n[50], c, 7);
  pair("text (300) on panel", r.n[300], r.panel, 4.5);
  pair("quiet text (500) on panel", r.n[500], r.panel, 4);
  pair("quiet text (500) on overlay", r.n[500], r.overlay, 4);
  pair("accent on panel", r.accent, r.panel, 3);
  pair("accent as text on panel", r.accentSoft, r.panel, 4.5);
  pair("button label on accent", r.onAccent, r.accentFill, 4.5);
  for (const k of ["ai", "wait", "added", "problem", "moved"] as const) pair(`${k} on panel`, r[k], r.panel, 3);
  pair("lines against panel", r.line, r.panel, r.style.lines === "strong" ? 3 : 1.25);
  pair("done on panel", r.done, r.panel, 3);
  if (r.style.zones > 0)
    for (const z of ["files", "tabs", "side", "bar"] as const) {
      pair(`text (300) on the ${z} region`, r.n[300], r.zone[z], 4.5);
      pair(`quiet text (500) on the ${z} region`, r.n[500], r.zone[z], 4);
    }
  if (r.style.zones > 0) for (const k of ["ai", "wait", "done", "problem"] as const) pair(`${k} on the side region`, r[k], r.zone.side, 3);
  if (r.style.events === "focus") pair("label on a filled 'waiting'", r.onWait, r.wait, 4.5);
  if (r.style.events === "loud") {
    pair("label on a filled 'waiting'", r.onWait, r.wait, 4.5);
    pair("label on a filled 'done'", r.onDone, r.done, 4.5);
    pair("label on a filled 'working'", r.onAi, r.ai, 4.5);
  }
  if (r.accentFill2 !== r.accentFill) pair("button label on the gradient's end", r.onAccent, r.accentFill2, 4.5);
  const glass = GLASS[r.style.glass];
  if (glass < 100) pair("quiet text on glass, bright text behind", r.n[500], mix(r.overlay, r.n[50], (100 - glass) / 200), 4);
  const backdrop = { none: 0, glow: 6, aurora: 12 }[r.style.backdrop];
  if (backdrop) pair("quiet text where the backdrop is strongest", r.n[500], mix(r.base, r.ai, backdrop / 100), 4);
  const means = { accent: r.accent, ai: r.ai, wait: r.wait, problem: r.problem };
  const keys = Object.keys(means) as (keyof typeof means)[];
  keys.forEach((x, i) => keys.slice(i + 1).forEach((y) => apart(`${x} ≠ ${y}`, means[x], means[y])));
  // A finished turn must not look like a question, a problem or work going on
  for (const k of ["wait", "problem", "ai"] as const) apart(`done ≠ ${k}`, r.done, r[k]);
  if (r.accent2 !== r.accent) for (const k of ["ai", "wait", "problem"] as const) apart(`accent2 ≠ ${k}`, r.accent2, r[k]);
  r.sessions.forEach((x, i) => r.sessions.slice(i + 1).forEach((y, j) => apart(`session ${i} ≠ session ${i + j + 1}`, x, y)));
  r.sessions.forEach((x, i) => (["accent", "wait", "problem"] as const).forEach((k) => apart(`session ${i} ≠ ${k}`, x, r[k])));
  return out;
}
