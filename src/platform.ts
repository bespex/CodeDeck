import { useEffect, useState } from "react";
import { platform, type Platform } from "./backend";

/**
 * What this computer offers (tmux, a terminal, X11), asked once for the whole window, to be shown
 * ("Detected on this computer"). What is offered per session or project the backend decides with it
 * (`Session.doors`/`actions`, `AssistantState.canStart`, docs/SITZUNGEN-PRUEFUNG.md K2).
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
