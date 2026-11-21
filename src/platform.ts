import { useEffect, useState } from "react";
import { onPlatformChanged, platform, type Platform } from "./backend";

/**
 * What this computer offers (tmux, a terminal, X11), asked once for the whole window and again when it was looked at anew, to be shown
 * ("Detected on this computer"). What is offered per session or project the backend decides with it
 * (`Session.doors`/`actions`, `AssistantState.canStart`, docs/SITZUNGEN-PRUEFUNG.md K2).
 */
let found: Promise<Platform> | null = null;
let known: Platform | null = null;

/** Until the answer is there, everything counts as possible: nothing flickers away on a normal computer. */
const UNKNOWN: Platform = { tmux: "", terminal: "", raiseWindows: true, globalShortcuts: true, placeWindows: true, wayland: false, desktop: "", tray: true, toggleCommand: "codedeck --toggle" };

export function usePlatform(): Platform {
  const [p, setP] = useState<Platform>(known ?? UNKNOWN);
  useEffect(() => {
    found ??= platform().then((answer) => (known = answer));
    let live = true;
    void found.then((answer) => live && setP(answer));
    // Looked at again from the welcome ("Check again")
    const stop = onPlatformChanged((answer) => {
      known = answer;
      found = Promise.resolve(answer);
      if (live) setP(answer);
    });
    return () => {
      live = false;
      stop();
    };
  }, []);
  return p;
}
