// The form of the window (docs/SEITENLEISTE.md): the full window or the sidebar, which is the right
// column alone. One state for every component; a jump into the deck or the file list (`openView`,
// showing a file) first brings the full window back.

import { useSyncExternalStore } from "react";
import { setWindowCompact } from "./backend";

/** The sidebar's width, kept for this machine; it is what the user last dragged it to. */
const WIDTH_KEY = "codedeck.sidebarWidth";
const DEFAULT_WIDTH = 400;
/** The default before 2026-11-16: kept as if never chosen, so the new default applies */
const OLD_DEFAULT = 340;
/** Wider than this it is no sidebar: such a value came from a switch that went wrong */
const MAX_WIDTH = 800;
const plausible = (w: number) => w >= 280 && w <= MAX_WIDTH;

let compact = false;
/** While the window changes its form: the content waits faded out, so its steps are not seen */
let switching = false;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export const isCompact = () => compact;

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, () => compact);
}

export function useSwitching(): boolean {
  return useSyncExternalStore(subscribe, () => switching);
}

/**
 * Switches the form. The layout changes first and the window follows, so the three columns are
 * never squeezed into the narrow window, nor the sidebar seen stretched for long.
 */
export async function setCompact(on: boolean) {
  if (on === compact) return;
  compact = on;
  switching = true;
  tell();
  const kept = Math.round(Number(localStorage.getItem(WIDTH_KEY)));
  const width = plausible(kept) && kept !== OLD_DEFAULT ? kept : DEFAULT_WIDTH;
  const before = await setWindowCompact(on, width).catch(() => null);
  if (!on && before && plausible(before)) localStorage.setItem(WIDTH_KEY, String(Math.round(before)));
  // A frame for the new layout to settle, then it fades in
  requestAnimationFrame(() => {
    switching = false;
    tell();
  });
}

export const toggleCompact = () => setCompact(!compact);
