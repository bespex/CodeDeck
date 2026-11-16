// The form of the window (docs/SEITENLEISTE.md): the full window or the sidebar, which is the right
// column alone. One state for every component; a jump into the deck or the file list (`openView`,
// showing a file) first brings the full window back.

import { useSyncExternalStore } from "react";
import { setWindowCompact } from "./backend";

/** The sidebar's width, kept for this machine; it is what the user last dragged it to. */
const WIDTH_KEY = "codedeck.sidebarWidth";
const DEFAULT_WIDTH = 340;

let compact = false;
const listeners = new Set<() => void>();

export const isCompact = () => compact;

export function useCompact(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => compact,
  );
}

/**
 * Switches the form. The layout changes first and the window follows, so the three columns are
 * never squeezed into the narrow window, nor the sidebar seen stretched for long.
 */
export async function setCompact(on: boolean) {
  if (on === compact) return;
  compact = on;
  listeners.forEach((l) => l());
  const width = Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_WIDTH;
  const before = await setWindowCompact(on, width).catch(() => null);
  if (!on && before) localStorage.setItem(WIDTH_KEY, String(Math.round(before)));
}

export const toggleCompact = () => setCompact(!compact);
