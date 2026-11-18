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

/** Dark or white ink for text and icons on a colour: the one with more contrast (WCAG). */
export function inkOn(hex: string): string {
  const luminance = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [dark, light] = ["#14161a", "#ffffff"];
  const bg = luminance(hex);
  // Contrast against each ink; mid tones (the mark colours) mostly read better dark
  return (bg + 0.05) / (luminance(dark) + 0.05) >= (luminance(light) + 0.05) / (bg + 0.05) ? dark : light;
}

/** The mark of a project: what it chose, else its first letter. */
export const markOf = (mark: ProjectMarkSpec | null | undefined): ProjectMarkSpec => mark ?? { kind: "letter" };

/** An icon's outline as a whole SVG on transparent, for drawing. */
export const iconSvg = (inner: string, stroke = "#ffffff", width = 2.2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

/** What waits in a project: how many sessions ask, and whether a turn is done. */
export interface Waits {
  asks: number;
  done: boolean;
}

/**
 * The window's icon: the mark on its colour, and what waits marked as on the tray icon (a pill with
 * the number that ask top right, a dot for a finished turn bottom right). As RGBA pixels, `size` ×
 * `size`, for `set_window_icon`.
 */
export async function drawWindowIcon(mark: ProjectMarkSpec, color: string, name: string, waits: Waits, size = 64): Promise<Uint8ClampedArray> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const r = size / 2;
  const fill = mark.color ?? color;
  // As in the overview: letter and icon in the ink that reads on the colour
  const ink = inkOn(fill);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();
  if (mark.kind === "icon" && mark.value) {
    const data = await loadLucide();
    const inner = data.icons[mark.value];
    if (inner) {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(inner, ink, 2.4))}`;
      await image.decode();
      const s = size * 0.58;
      ctx.drawImage(image, r - s / 2, r - s / 2, s, s);
    }
  } else {
    const text = mark.kind === "emoji" && mark.value ? mark.value : name.charAt(0).toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = ink;
    ctx.font = mark.kind === "emoji" ? `${Math.round(size * 0.58)}px "Noto Color Emoji", sans-serif` : `800 ${Math.round(size * 0.55)}px "Open Sans", sans-serif`;
    ctx.fillText(text, r, r + size * 0.04);
  }
  const image = ctx.getImageData(0, 0, size, size);
  markWaiting(image.data, size, waits.asks, waits.done);
  return image.data;
}

/* What waits, marked in the shapes and sizes every be spex app uses (Maillet's tray), in CodeDeck's
   colours. Pixel for pixel the same as `icon.rs` `mark_waiting`, which draws the tray icon. */
const ASKS = [0xe0, 0xa8, 0x68, 255];
const DONE = [0x6c, 0xc5, 0x8e, 255];
const INK = [0x14, 0x16, 0x1a, 255];
const WHITE = [255, 255, 255, 255];
/** 3×5 pixel digits, one row per entry, bits from the left (Maillet's). */
const DIGITS = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];

/** On square RGBA pixels: the pill with the number of asking sessions, the dot for a finished turn. */
export function markWaiting(data: Uint8ClampedArray, size: number, asks: number, done: boolean) {
  const s = Math.max(1, Math.floor(size / 32));
  const set = (x: number, y: number, px: number[]) => {
    if (x >= 0 && x < size && y >= 0 && y < size) data.set(px, (y * size + x) * 4);
  };
  if (asks > 0) {
    // The pill, half the icon high, at least round, in the top right corner
    const text = String(Math.min(asks, 99));
    const h = 16 * s;
    const w = Math.max((text.length * 8 + 6) * s, h);
    const [x0, r] = [size - w, h / 2];
    for (let y = 0; y < h; y++)
      for (let x = x0; x < size; x++) {
        const cx = Math.min(Math.max(x - x0, r), w - r) + x0;
        if ((x - cx) ** 2 + (y - r) ** 2 <= r * r) set(x, y, ASKS);
      }
    // The digits centred, each 6 px wide plus a gap of 2
    let cx = x0 + Math.floor((w - (text.length * 8 - 2) * s) / 2);
    for (const ch of text) {
      DIGITS[Number(ch)].forEach((bits, row) => {
        for (let col = 0; col < 3; col++)
          if (bits & (4 >> col))
            for (let dy = 0; dy < 2 * s; dy++) for (let dx = 0; dx < 2 * s; dx++) set(cx + col * 2 * s + dx, 3 * s + row * 2 * s + dy, INK);
      });
      cx += 8 * s;
    }
  }
  if (done) {
    // The dot in the bottom right corner, a white ring round it
    const [outer, inner] = [6 * s, 4 * s + Math.floor(s / 2)];
    const [cx, cy] = [size - outer, size - outer];
    for (let y = cy - outer; y <= cy + outer; y++)
      for (let x = cx - outer; x <= cx + outer; x++) {
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d <= outer * outer) set(x, y, d <= inner * inner ? DONE : WHITE);
      }
  }
}
