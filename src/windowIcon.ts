// The project window draws its taskbar icon itself (docs/UEBERSICHT.md): its project's mark on its
// colour and the marks for what waits. Drawn here because only the web view can draw emoji and SVG;
// the backend sets the pixels (`set_window_icon`).

import { live, myProject, onProjectChanged, setWindowIconPixels, type ProjectLook } from "./backend";
import { drawWindowIcon, markOf, type Waits } from "./marks";

let look: ProjectLook | null = null;
let waits: Waits = { asks: 0, done: false };
let drawing = Promise.resolve();

async function paint() {
  if (!live || !look) return;
  const { mark, color, name } = look;
  const pixels = await drawWindowIcon(markOf(mark), color, name, waits);
  await setWindowIconPixels(Array.from(pixels), 64);
}

/** One after the other: a quick change of status must not overtake the drawing before it. */
const repaint = () => (drawing = drawing.then(paint).catch(() => {}));

async function load() {
  look = await myProject().catch(() => null);
  repaint();
}

let started = false;

/** What waits in this window's project: the marks on its icon. Starts keeping the icon on first use. */
export function setWindowWaits(next: Waits) {
  if (!started) {
    started = true;
    void load();
    // The mark changes in the overview: draw again; a switch to another project too
    onProjectChanged((path) => (!look || look.path === path) && void load());
  }
  if (next.asks === waits.asks && next.done === waits.done && look) return;
  waits = next;
  repaint();
}

/** The window shows another project now: its look is read again. */
export const projectSwitched = () => void load();
