// Which view of the deck is open, for every component: the right column jumps into a view
// (e.g. its summary of the next prompt opens the Next prompt view), the deck shows it.

import { useEffect, useState } from "react";

export type ViewId = "activity" | "changes" | "workbench" | "next";

/** A project opens in Changes (D14). */
let current: ViewId = "changes";
const listeners = new Set<() => void>();

export function openView(view: ViewId) {
  current = view;
  listeners.forEach((l) => l());
}

export function useView(): [ViewId, (view: ViewId) => void] {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return [current, openView];
}
