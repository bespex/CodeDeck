// Project marks (docs/UEBERSICHT.md, "Marke je Projekt"): a Lucide icon, an emoji or the project's
// first letter on a circle in its colour. The same mark in the overview, the project window's header
// and the window's icon in the taskbar, with a dot for what waits.

import { useEffect, useState } from "react";
import type { ProjectMarkSpec } from "./backend";

/** Outlines and keywords of every Lucide icon, loaded once when a mark needs them. */
export interface Lucide {
  icons: Record<string, string>;
  tags: Record<string, string>;
}

let lucide: Lucide | null = null;
let loading: Promise<Lucide> | null = null;

export function loadLucide(): Promise<Lucide> {
  // A file of its own (public/lucide.json, tools/lucide-for-app.mjs): fetched once, not in the app's code
  loading ??= fetch("/lucide.json")
    .then((r) => r.json() as Promise<Lucide>)
    .then((data) => (lucide = data));
  return loading;
}

/** The icons, once loaded; `null` until then (a mark shows its letter meanwhile). */
export function useLucide(): Lucide | null {
  const [data, setData] = useState(lucide);
  useEffect(() => {
    if (!data) void loadLucide().then(setData);
  }, [data]);
  return data;
}

/** Colours to choose from: the session colours of the themes, and two more. */
export const MARK_COLORS = ["#7f95ff", "#4fc9bd", "#e391d0", "#c3cf6c", "#62b6ee", "#c08cf5", "#f0a060", "#6cc58e", "#e66a78", "#a9afb5"];

/** Icons that suit projects, shown before anything is typed. */
export const SUGGESTED = (
  "rocket book-open database server globe code terminal flask-conical leaf sprout brain bot shield layers package puzzle " +
  "palette camera map compass house factory wallet receipt chart-line cpu cloud zap flame star heart anchor feather gem " +
  "key-round landmark mountain trees satellite orbit telescope microscope notebook-pen newspaper graduation-cap briefcase " +
  "shopping-cart truck plane ship bike coffee gamepad-2 film pen-tool hammer wrench bug sun moon snowflake tent castle"
).split(" ");

/** Emoji for projects, no faces: grouped like a small picker. */
export const EMOJI: [string, string][] = [
  ["Technology", "🛰️ 🚀 🧪 🔬 🔧 🛠️ ⚙️ 💾 🖥️ 💡 🔋 📡 🤖 🧬 🧲 🔌"],
  ["Nature", "🌲 🌵 🌊 🔥 ⛰️ 🌙 ☀️ ⭐ ❄️ 🌈 🍀 🌻 🌸 🍄 🌍 ⚡"],
  ["Animals", "🦊 🐙 🦉 🐝 🐢 🦋 🐳 🦀 🐧 🦁 🐺 🦜 🐞 🦔 🐬 🦄"],
  ["Places", "🏠 🏭 🏰 🏝️ 🗼 🏔️ 🏛️ 🏟️ 🗺️ 🧭 ⛺ 🚉"],
  ["Things", "📚 🧾 🎨 🎵 📷 🎲 🧩 🎯 🔑 📦 🧰 🗂️ 📝 📊 💼 🏷️"],
  ["Food", "☕ 🍎 🍋 🍕 🍩 🍪 🧁 🍇 🥕 🌶️"],
  ["Symbols", "♻️ ⚓ 🔶 🔷 ❤️ ⚜️ ☯️ 🏁 ♾️ ⚛️"],
];

/** German words the search understands: the icons' names and keywords are English. */
const DE: Record<string, string> = {
  buch: "book", bücher: "book", geld: "money", rechnung: "bill", baum: "tree", wald: "forest", wetter: "weather", spiel: "game",
  musik: "music", gesundheit: "health", laden: "shop", einkauf: "shopping", auto: "car", rakete: "rocket", haus: "house",
  daten: "database", datenbank: "database", karte: "map", welt: "globe", ki: "ai", schule: "school", garten: "garden", essen: "food",
  reise: "travel", foto: "camera", sicherheit: "security", schloss: "lock", werkzeug: "tool", brief: "mail", nachricht: "message",
  gespräch: "chat", stern: "star", herz: "heart", blume: "flower", tier: "animal", hund: "dog", katze: "cat", vogel: "bird",
  fisch: "fish", berg: "mountain", meer: "sea", sonne: "sun", mond: "moon", feuer: "fire", wasser: "water", zeit: "time", uhr: "clock",
  kalender: "calendar", bild: "image", schreiben: "write", stift: "pen", ordner: "folder", datei: "file", netz: "network",
  wolke: "cloud", schiff: "ship", zug: "train", flugzeug: "plane", fahrrad: "bike", bau: "construction", fabrik: "factory",
  kaffee: "coffee", lernen: "learn", wissen: "knowledge", forschung: "research", labor: "lab", roboter: "robot", gehirn: "brain",
  rechner: "computer",
};

/** Icons for a search: whole words and word starts in names and keywords, names first, shorter names first. */
export function searchIcons(data: Lucide, text: string): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean).map((w) => DE[w] ?? w);
  if (!words.length) return SUGGESTED.filter((n) => data.icons[n]);
  const scored: [number, string][] = [];
  for (const name of Object.keys(data.icons)) {
    const own = name.split("-");
    const tags = (data.tags[name] ?? "").split(/[\s-]+/);
    let score = 0;
    for (const w of words) {
      // Word starts only for words of three letters and more: "ai" must not find "air"
      const s = own.includes(w) ? 100 : w.length > 2 && own.some((t) => t.startsWith(w)) ? 60 : tags.includes(w) ? 40 : w.length > 2 && tags.some((t) => t.startsWith(w)) ? 20 : 0;
      if (!s) {
        score = 0;
        break;
      }
      score += s - own.length;
    }
    if (score > 0) scored.push([score, name]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1])).map(([, n]) => n);
}

/** The mark of a project: what it chose, else its first letter. */
export const markOf = (mark: ProjectMarkSpec | null | undefined): ProjectMarkSpec => mark ?? { kind: "letter" };

/** An icon's outline as a whole SVG, white on transparent, for drawing. */
export const iconSvg = (inner: string, stroke = "#ffffff", width = 2.2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

/**
 * The window's icon: the mark on its colour, the dot for what waits (amber asks, green done) top
 * right. As RGBA pixels, `size` × `size`, for `set_window_icon`.
 */
export async function drawWindowIcon(mark: ProjectMarkSpec, color: string, name: string, waits: "asks" | "done" | null, size = 64): Promise<Uint8ClampedArray> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  ctx.fillStyle = mark.color ?? color;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();
  if (mark.kind === "icon" && mark.value) {
    const data = await loadLucide();
    const inner = data.icons[mark.value];
    if (inner) {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(inner, "#ffffff", 2.4))}`;
      await image.decode();
      const s = size * 0.58;
      ctx.drawImage(image, r - s / 2, r - s / 2, s, s);
    }
  } else {
    const text = mark.kind === "emoji" && mark.value ? mark.value : name.charAt(0).toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0b0d10";
    ctx.font = mark.kind === "emoji" ? `${Math.round(size * 0.58)}px "Noto Color Emoji", sans-serif` : `800 ${Math.round(size * 0.55)}px "Open Sans", sans-serif`;
    ctx.fillText(text, r, r + size * 0.04);
  }
  if (waits) {
    const d = size * 0.2;
    ctx.fillStyle = "#14161a";
    ctx.beginPath();
    ctx.arc(size - d, d, d, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = waits === "asks" ? "#e0a868" : "#6cc58e";
    ctx.beginPath();
    ctx.arc(size - d, d, d * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size).data;
}
