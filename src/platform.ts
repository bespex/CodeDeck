import { useEffect, useState } from "react";
import { platform, type Platform, type Session } from "./backend";

/**
 * What this computer offers (tmux, a terminal, X11), asked once for the whole window: what it lacks
 * is not offered, rather than failing on a click (docs/SITZUNGEN-PRUEFUNG.md K1, K5).
 */
let found: Promise<Platform> | null = null;
let known: Platform | null = null;

/** Until the answer is there, everything counts as possible: nothing flickers away on a normal computer. */
const UNKNOWN: Platform = { tmux: "", terminal: "", raiseWindows: true, globalShortcuts: true, placeWindows: true, wayland: false, desktop: "", tray: true };

export function usePlatform(): Platform {
  const [p, setP] = useState<Platform>(known ?? UNKNOWN);
  useEffect(() => {
    found ??= platform().then((answer) => (known = answer));
    let live = true;
    void found.then((answer) => live && setP(answer));
    return () => {
      live = false;
    };
  }, []);
  return p;
}

/** Starting a session (▶, ＋, today's list) needs tmux. */
export const canStart = (p: Platform) => p.tmux !== null;

/** Whether a session can be opened in a terminal on this computer: through its tool or tmux a
 *  terminal program opens it; one started by hand in a terminal only has its window raised (X11). */
export function hasTerminalDoor(s: Session, p: Platform): boolean {
  if (s.place?.background || s.place?.tmux) return p.terminal !== null;
  return s.place?.pid != null && p.raiseWindows;
}

/** Continuing a conversation: in the background its tool opens it in a terminal, else in tmux. */
export const canContinue = (s: Session, p: Platform) => (s.place?.background ? p.terminal !== null : canStart(p));
