// The scratch folder (`.scratch/` in the project, a tile of the Workbench view): what sessions made
// that is not part of the project yet. Its files are moved into the project by dragging them onto a
// folder of the file list; the outcome is told in the Workbench view, wherever the drop happened.

import { useEffect, useState } from "react";
import { scratchMove } from "./backend";

/** What a dragged scratch file carries: its project-relative path. */
export const SCRATCH_DRAG = "application/x-codedeck-scratch";

export const SCRATCH_DIR = ".scratch";
export const inScratch = (path: string) => path === SCRATCH_DIR || path.startsWith(`${SCRATCH_DIR}/`);

/** The last move and how it went, for the view to say. */
export interface Moved {
  from: string;
  to: string | null;
  error: string | null;
}

let last: Moved | null = null;
const listeners = new Set<() => void>();

/** Moves a scratch file into `dir` of the project (`""` for the root), under its own name. */
export async function moveIntoProject(from: string, dir: string, name = from.split("/").pop() ?? from) {
  const to = dir ? `${dir}/${name}` : name;
  try {
    last = { from, to: await scratchMove(from, to), error: null };
  } catch (e) {
    last = { from, to: null, error: String(e) };
  }
  listeners.forEach((l) => l());
}

export function useLastMove(): Moved | null {
  const [, redraw] = useState(0);
  useEffect(() => {
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);
  return last;
}
